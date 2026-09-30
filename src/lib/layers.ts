/**
 * Chart layer orchestration: turns the active chart's sources into a render
 * state — FrameManager channels (one raster and/or one vector channel per
 * source) and, with the GPU renderer, one tile-free `WeatherGpuLayer` slot
 * per raster source instead of its raster channel — and shows it as one
 * synchronized frame. Data is shared per variable inside the om protocol, so
 * a raster and vector channel of the same source trigger a single fetch, and
 * toggling contours/arrows re-renders from cached data.
 */
import { get } from 'svelte/store';

import {
	getDomainBoundary,
	isGpuSupported,
	isSeamlessDomain,
	selectSeamlessLayers,
	variableHasDirections,
	variableSupportsBarbs
} from '@openmeteo/weather-map-layer';
import * as maplibregl from 'maplibre-gl';
import { mode } from 'mode-watcher';
import { toast } from 'svelte-sonner';

import { chartSources } from '$lib/stores/chart';
import { map as m } from '$lib/stores/map';
import { loading, opacity, preferences as p, renderer } from '$lib/stores/preferences';
import { modelRun, time } from '$lib/stores/time';
import { selectedDomain } from '$lib/stores/variables';
import { vectorOptions as vO } from '$lib/stores/vector';

import { createCommitBarrier } from '$lib/commit-barrier';
import {
	BEFORE_LAYER_RASTER,
	BEFORE_LAYER_VECTOR,
	BEFORE_LAYER_VECTOR_WATER_CLIP,
	HILLSHADE_LAYER
} from '$lib/constants';
import { type FrameChannel, FrameManager } from '$lib/frame-manager';
import { GpuRasterManager, type GpuRasterSlotSpec } from '$lib/gpu-raster-manager';
import { rasterChannel, vectorChannel } from '$lib/om-layer-defs';

import { refreshPopup } from './popup';
import { omProtocolSettings } from './stores/om-protocol-settings';
import { getOmUrlForSource } from './url';

import type { Domain } from '@openmeteo/weather-map-layer';

let frameManager: FrameManager | undefined;
let gpuRasters: GpuRasterManager | undefined;

// Combined loading indicator: GPU raster loads and vector tile frames finish
// independently; the spinner shows while either is pending.
let vectorLoading = false;
let rasterLoading = false;
const updateLoading = (): void => loading.set(vectorLoading || rasterLoading);

const getRasterOpacity = (): number => {
	const opacityValue = get(opacity) / 100;
	return mode.current === 'dark' ? Math.max(0, (opacityValue * 100 - 10) / 100) : opacityValue;
};

/** Probed once per page: WebGL2 support does not change at runtime. */
let gpuSupported: boolean | undefined;
const useGpu = (): boolean => {
	if (get(renderer) !== 'gpu') return false;
	gpuSupported ??= isGpuSupported();
	return gpuSupported;
};

/**
 * Whether the GPU layer can draw this source's raster; otherwise it stays on
 * the CPU tile path (the rest of the chart keeps the GPU). These are exactly
 * the conditions under which `WeatherGpuLayer.prepareUrl` rejects a URL — a
 * composite domain has one grid per layer, the shader samples one regular
 * lat/lon grid and colour-maps one scalar per cell — checked up front so a
 * rejected source never leaves a gap on the map.
 */
const gpuDrawsRaster = (domain: Domain, variable: string): boolean =>
	!isSeamlessDomain(domain) && domain.grid.type === 'regular' && !variableHasDirections(variable);

interface RenderState {
	rasters: GpuRasterSlotSpec[];
	vectors: FrameChannel[];
}

/** Build the render state for the current chart, or undefined while not ready. */
const buildRenderState = (): RenderState | undefined => {
	const sources = get(chartSources);
	const preferences = get(p);
	const vectorOptions = get(vO);
	const dark = mode.current === 'dark';
	const rasterBefore = preferences.hillshade ? HILLSHADE_LAYER : BEFORE_LAYER_RASTER;
	const vectorBefore = preferences.clipWater ? BEFORE_LAYER_VECTOR_WATER_CLIP : BEFORE_LAYER_VECTOR;

	const gpu = useGpu();
	const domain = get(selectedDomain);
	const rasters: GpuRasterSlotSpec[] = [];
	const vectors: FrameChannel[] = [];
	for (const source of sources) {
		const omUrl = getOmUrlForSource(source);
		if (!omUrl) return undefined;
		const url = 'om://' + omUrl;

		if (source.raster) {
			const rasterOpacity = getRasterOpacity() * (source.opacity ?? 1);
			if (gpu && gpuDrawsRaster(domain, source.variable)) {
				rasters.push({
					key: source.variable,
					url,
					opacity: rasterOpacity,
					beforeLayer: rasterBefore
				});
			} else {
				vectors.push(rasterChannel(source.variable, url, rasterOpacity, rasterBefore));
			}
		}
		// Contours, arrows and grid points are CPU tile layers on both paths;
		// om-layer-defs.ts adds them the same way whichever renderer is active.
		if (source.contours || source.arrows || vectorOptions.grid) {
			vectors.push(
				vectorChannel(source.variable, url, {
					contours: !!source.contours,
					arrows: !!source.arrows,
					// Barbs encode knots, so sources whose directions come with another
					// quantity (waves, currents) keep arrows under the barb setting
					arrowStyle:
						vectorOptions.arrowStyle === 'barb' && !variableSupportsBarbs(source.variable)
							? 'arrow'
							: vectorOptions.arrowStyle,
					grid: vectorOptions.grid,
					dark,
					// Inline vectors join the raster stack right above their own
					// raster, so rasters of later sources overlap them
					beforeLayer: source.inlineVectors ? rasterBefore : vectorBefore,
					inline: !!source.inlineVectors,
					lineWidth: source.lineWidth
				})
			);
		}
	}
	return { rasters, vectors };
};

/**
 * (Re)initialize the frame manager. Called on map load and after every
 * basemap style reload (which wipes all sources/layers).
 */
export const addOmFileLayers = (): void => {
	const map = get(m);
	if (!map) return;

	frameManager?.destroy();
	frameManager = new FrameManager(map, {
		crossFadeMs: 250,
		retainMax: 3,
		onLoadingChange: (isLoading) => {
			vectorLoading = isLoading;
			updateLoading();
		},
		onCommit: () => refreshPopup(),
		// Without this a failed frame is silent and just keeps the previous one
		// — on a first load that is an empty map with no hint
		onError: () =>
			toast.error('Could not load the weather data for this view.', { id: 'om-data-error' }),
		slowLoadWarningMs: 10000,
		onSlowLoad: () =>
			toast.warning('Loading data might be limited by bandwidth or upstream server speed.')
	});

	gpuRasters?.destroy();
	gpuRasters = new GpuRasterManager(map, {
		settings: get(omProtocolSettings),
		onLoadingChange: (isLoading) => {
			rasterLoading = isLoading;
			updateLoading();
		},
		onShown: () => refreshPopup(),
		onError: () =>
			toast.error('Could not load the weather data for this view.', { id: 'om-data-error' })
	});
	changeOMfileURL();

	// (Re)creating the map layers (initial load or style reload) drops the
	// border layers, so force them to be drawn again.
	resetSeamlessBorderLayer();
	updateSeamlessBorderLayer();
};

/**
 * Move all resident raster stacks (and inline vectors, which share the
 * anchor) to the insertion point matching the current hillshade preference.
 * Called by the hillshade toggle, which changes the basemap stack without a
 * style reload.
 */
export const reanchorRasterLayers = (): void => {
	const hillshade = get(p).hillshade;
	const [from, to] = hillshade
		? [BEFORE_LAYER_RASTER, HILLSHADE_LAYER]
		: [HILLSHADE_LAYER, BEFORE_LAYER_RASTER];
	gpuRasters?.reanchor(from, to);
	// Inline vector channels share the raster anchor
	frameManager?.reanchor(from, to);
};

/**
 * Re-render the active chart. Both managers deduplicate unchanged render
 * states, so this is safe to call on every store change.
 */
export const changeOMfileURL = (): void => {
	const map = get(m);
	if (!map || !frameManager || !gpuRasters) return;

	// `undefined` means a source is not ready yet; an empty state means the
	// chart deliberately draws nothing, which fades the GPU layers out and
	// commits a blank vector frame in place of the previous one
	const renderState = buildRenderState();
	if (!renderState) return;

	// The GPU layers parse URLs against the settings object, which the store
	// replaces on changes (clipping, colour scales) — hand them the live one.
	gpuRasters.updateSettings(get(omProtocolSettings));
	// Both managers load independently but commit through one barrier, so every
	// layer of the new render state starts animating in the same frame.
	const barrier = createCommitBarrier(2);
	gpuRasters.show(renderState.rasters, barrier);
	frameManager.show(renderState.vectors, barrier);
	updateSeamlessBorderLayer();
};

// =============================================================================
// Seamless domain border overlay
// =============================================================================

const SEAMLESS_BORDER_SOURCE_ID = 'seamlessBorderSource';

const isDark = (): boolean => mode.current === 'dark';

const removeSeamlessBorderLayer = (): void => {
	const map = get(m);
	if (!map) return;
	// Collect IDs first to avoid mutating the layer list while iterating
	const toRemove = (map.getStyle()?.layers ?? [])
		.map((l) => l.id)
		.filter((id) => id.startsWith('seamless-border-'));
	for (const id of toRemove) {
		if (map.getLayer(id)) map.removeLayer(id);
	}
	if (map.getSource(SEAMLESS_BORDER_SOURCE_ID)) map.removeSource(SEAMLESS_BORDER_SOURCE_ID);
};

// Tracks what the borders were last drawn for, so repeated calls (e.g. on every
// timestep change via changeOMfileURL) don't needlessly remove + re-add the
// layers — which restarts their fade-in transition and makes them flash.
let lastBorderSignature: string | null = null;

/** Forces the next updateSeamlessBorderLayer() to redraw (e.g. after a style reload). */
export const resetSeamlessBorderLayer = (): void => {
	lastBorderSignature = null;
};

export const updateSeamlessBorderLayer = (): void => {
	const map = get(m);
	if (!map) return;

	const preferences = get(p);
	const domain = get(selectedDomain);
	const draw = preferences.showSeamlessBorders && isSeamlessDomain(domain);

	// Only sub-domains the protocol would load at the selected time get a
	// border: past its forecast horizon a regional model drops out of the
	// composite, so its border must disappear too. The base layer (the last
	// one) covers the composite's whole extent and needs none.
	const modelRunDate = get(modelRun);
	const validTime = get(time);
	const leadTimeHours =
		modelRunDate && validTime
			? (validTime.getTime() - modelRunDate.getTime()) / 3_600_000
			: undefined;
	const regionalLayers =
		draw && isSeamlessDomain(domain)
			? selectSeamlessLayers(domain, get(omProtocolSettings).domainOptions, {
					leadTimeHours
				}).filter(({ layer }) => layer !== domain.layers[domain.layers.length - 1])
			: [];

	// Borders depend on the domain, the theme (colours), the toggle and which
	// sub-domains are available. Skip the flashing remove/re-add when none of
	// those changed (most timestep changes keep the same availability).
	const signature = draw
		? `${domain.value}|${isDark()}|${regionalLayers.map((l) => l.domain.value).join(',')}`
		: 'none';
	if (signature === lastBorderSignature) return;
	lastBorderSignature = signature;

	removeSeamlessBorderLayer();
	if (regionalLayers.length === 0) return;

	// Follow each domain's true outline: a precomputed data-shape footprint for
	// NULL-padded reprojected grids, otherwise a curved perimeter for projected
	// grids / the bounds rectangle for plain regular grids.
	//
	// Drawn as a LineString rather than a Polygon: the ring already closes on
	// itself, and a polygon's implicit ring-closing segment would jump ~360°
	// across the map for boundaries that cross the antimeridian or encircle a
	// pole (the perimeter's longitudes are continuous but may exceed ±180°).
	const features: GeoJSON.Feature<GeoJSON.LineString>[] = regionalLayers.map(
		({ layer, domain: concreteDomain }, i) => ({
			type: 'Feature',
			geometry: { type: 'LineString', coordinates: getDomainBoundary(concreteDomain) },
			properties: {
				layerIndex: i,
				minZoom: layer.minZoom,
				label: concreteDomain.label ?? concreteDomain.value
			}
		})
	);

	map.addSource(SEAMLESS_BORDER_SOURCE_ID, {
		type: 'geojson',
		data: { type: 'FeatureCollection', features }
	});

	// One line + one symbol MapLibre layer per boundary, each with its own
	// zoom-dependent opacity and colour keyed to that sub-domain's minZoom.
	const lineColor = isDark() ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)';
	const textColor = isDark() ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.75)';
	const textHalo = isDark() ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
	// Highlight colour once the sub-domain is active
	const activeLineColor = 'rgba(30,120,255,0.8)';
	const activeTextColor = 'rgba(30,120,255,1)';

	for (const feature of features) {
		const i = feature.properties!.layerIndex as number;
		const minZoom = feature.properties!.minZoom as number;
		// Tiles of zoom `minZoom` are shown from map zoom minZoom - 0.5, so that
		// is where the sub-domain takes over; the border fades in over the 2.5
		// zoom levels before it, announcing the finer model ahead of the switch.
		const activeZoom = minZoom - 0.5;
		const fadeStart = Math.max(0, minZoom - 3);

		const opacityExpr: maplibregl.ExpressionSpecification | number =
			fadeStart < activeZoom
				? (['interpolate', ['linear'], ['zoom'], fadeStart, 0, activeZoom, 1] as const)
				: 1;

		const lineColorExpr: maplibregl.ExpressionSpecification = [
			'step',
			['zoom'],
			lineColor,
			activeZoom,
			activeLineColor
		];
		const textColorExpr: maplibregl.ExpressionSpecification = [
			'step',
			['zoom'],
			textColor,
			activeZoom,
			activeTextColor
		];

		// Dashed boundary outline
		map.addLayer(
			{
				id: `seamless-border-line-${i}`,
				type: 'line',
				source: SEAMLESS_BORDER_SOURCE_ID,
				minzoom: fadeStart,
				filter: ['==', ['get', 'layerIndex'], i],
				paint: {
					'line-color': lineColorExpr,
					'line-width': 1.5,
					'line-dasharray': [4, 3],
					'line-opacity': opacityExpr
				}
			},
			BEFORE_LAYER_VECTOR
		);

		// Domain name label placed along the border line
		map.addLayer(
			{
				id: `seamless-border-label-${i}`,
				type: 'symbol',
				source: SEAMLESS_BORDER_SOURCE_ID,
				minzoom: fadeStart,
				filter: ['==', ['get', 'layerIndex'], i],
				layout: {
					'text-field': ['get', 'label'],
					'text-size': 11,
					'symbol-placement': 'line',
					'symbol-spacing': 400,
					'text-rotation-alignment': 'map',
					'text-offset': [0, -0.8],
					'text-allow-overlap': false,
					'text-ignore-placement': true
				},
				paint: {
					'text-color': textColorExpr,
					'text-halo-color': textHalo,
					'text-halo-width': 1.5,
					'text-opacity': opacityExpr
				}
			},
			BEFORE_LAYER_VECTOR
		);
	}
};

/**
 * om:// source URL per source variable of the currently visible render state,
 * in chart source order (used by the popup).
 */
export const getActiveOmUrls = (): Map<string, string> => {
	// GPU raster slots are keyed by the source variable directly
	const urls = gpuRasters?.getActiveUrls() ?? new Map<string, string>();
	for (const channel of frameManager?.getActiveChannels() ?? []) {
		// Channel keys are `${variable}:kind:...`; variables contain no colon
		const key = channel.key.slice(0, channel.key.indexOf(':'));
		if (!urls.has(key)) urls.set(key, channel.url);
	}
	return urls;
};
