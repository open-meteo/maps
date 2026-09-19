/**
 * Layer orchestration: turns the active om url into FrameManager channels (a
 * raster fill and, when contours/arrows/grid are on, a vector channel) and
 * shows them as one synchronized frame. Data is shared per variable inside
 * the om protocol, so both channels of a source trigger a single fetch, and
 * toggling contours/arrows re-renders from cached data.
 */
import { get } from 'svelte/store';

import {
	getDomainBoundary,
	isSeamlessDomain,
	resolveConcreteDomain
} from '@openmeteo/weather-map-layer';
import * as maplibregl from 'maplibre-gl';
import { mode } from 'mode-watcher';
import { toast } from 'svelte-sonner';

import { map as m } from '$lib/stores/map';
import { loading, opacity, preferences as p } from '$lib/stores/preferences';
import { modelRun, time } from '$lib/stores/time';
import { selectedDomain } from '$lib/stores/variables';
import { vectorOptions as vO } from '$lib/stores/vector';

import {
	BEFORE_LAYER_RASTER,
	BEFORE_LAYER_VECTOR,
	BEFORE_LAYER_VECTOR_WATER_CLIP,
	HILLSHADE_LAYER
} from '$lib/constants';
import { type FrameChannel, FrameManager } from '$lib/frame-manager';
import { rasterChannel, vectorChannel } from '$lib/om-layer-defs';

import { refreshPopup } from './popup';
import { omProtocolSettings } from './stores/om-protocol-settings';
import { getOMUrl } from './url';

let frameManager: FrameManager | undefined;

/** Single source for now; the key only has to be stable across frames. */
const SOURCE_KEY = 'om';

const getRasterOpacity = (): number => {
	const opacityValue = get(opacity) / 100;
	return mode.current === 'dark' ? Math.max(0, (opacityValue * 100 - 10) / 100) : opacityValue;
};

/** Build the channels for the current state, or undefined while not ready. */
const buildChannels = (): FrameChannel[] | undefined => {
	const omUrl = getOMUrl();
	if (!omUrl) return undefined;
	const url = 'om://' + omUrl;

	const preferences = get(p);
	const vectorOptions = get(vO);
	const rasterBefore = preferences.hillshade ? HILLSHADE_LAYER : BEFORE_LAYER_RASTER;
	const vectorBefore = preferences.clipWater ? BEFORE_LAYER_VECTOR_WATER_CLIP : BEFORE_LAYER_VECTOR;

	const channels: FrameChannel[] = [
		rasterChannel(SOURCE_KEY, url, getRasterOpacity(), rasterBefore)
	];

	if (vectorOptions.contours || vectorOptions.arrows || vectorOptions.grid) {
		channels.push(
			vectorChannel(SOURCE_KEY, url, {
				contours: vectorOptions.contours,
				arrows: vectorOptions.arrows,
				grid: vectorOptions.grid,
				dark: mode.current === 'dark',
				beforeLayer: vectorBefore
			})
		);
	}

	return channels;
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
		onLoadingChange: (isLoading) => loading.set(isLoading),
		onCommit: () => refreshPopup(),
		// Without this a failed frame is silent and just keeps the previous one
		// — on a first load that is an empty map with no hint
		onError: () =>
			toast.error('Could not load the weather data for this view.', { id: 'om-data-error' }),
		slowLoadWarningMs: 10000,
		onSlowLoad: () =>
			toast.warning('Loading data might be limited by bandwidth or upstream server speed.')
	});
	changeOMfileURL();

	// (Re)creating the map layers (initial load or style reload) drops the
	// border layers, so force them to be drawn again.
	resetSeamlessBorderLayer();
	updateSeamlessBorderLayer();
};

/**
 * Move all resident raster stacks to the insertion point matching the current
 * hillshade preference. Called by the hillshade toggle, which changes the
 * basemap stack without a style reload.
 */
export const reanchorRasterLayers = (): void => {
	const hillshade = get(p).hillshade;
	const [from, to] = hillshade
		? [BEFORE_LAYER_RASTER, HILLSHADE_LAYER]
		: [HILLSHADE_LAYER, BEFORE_LAYER_RASTER];
	frameManager?.reanchor(from, to);
};

/**
 * Re-render the current state. The frame manager deduplicates unchanged
 * render states, so this is safe to call on every store change.
 */
export const changeOMfileURL = (): void => {
	const map = get(m);
	if (!map || !frameManager) return;

	const channels = buildChannels();
	if (!channels) return;

	frameManager.show(channels);
	updateSeamlessBorderLayer();
};

/** om:// source url of the currently visible frame (used by the popup). */
export const getActiveOmUrl = (): string | undefined => frameManager?.getActiveChannels()[0]?.url;

// =============================================================================
// Seamless domain border overlay

const isDark = (): boolean => mode.current === 'dark';
// =============================================================================

const SEAMLESS_BORDER_SOURCE_ID = 'seamlessBorderSource';

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

	// A regional sub-layer only has data up to its forecast horizon
	// (maxForecastHours). Past it the seamless composite falls back to a coarser
	// model, so the regional border must disappear too. Lead time is the gap
	// between the selected valid time and the model run, matching the lead-time
	// gate the seamless protocol applies when loading sub-layers.
	const modelRunDate = get(modelRun);
	const validTime = get(time);
	const leadTimeHours =
		modelRunDate && validTime
			? (validTime.getTime() - modelRunDate.getTime()) / 3_600_000
			: undefined;
	const layerAvailable = (maxForecastHours: number | undefined): boolean =>
		maxForecastHours === undefined ||
		leadTimeHours === undefined ||
		leadTimeHours <= maxForecastHours;

	// Borders depend on the domain + theme (colours) + toggle, plus which sub-layers
	// are available at the current lead time. Skip the flashing remove/re-add when
	// none of those changed (most timestep changes keep the same availability).
	const availabilityKey =
		draw && isSeamlessDomain(domain)
			? domain.layers
					.slice(0, -1)
					.map((l) => (layerAvailable(l.maxForecastHours) ? '1' : '0'))
					.join('')
			: '';
	const signature = draw ? `${domain.value}|${isDark()}|${availabilityKey}` : 'none';
	if (signature === lastBorderSignature) return;
	lastBorderSignature = signature;

	removeSeamlessBorderLayer();
	if (!isSeamlessDomain(domain) || !preferences.showSeamlessBorders) return;

	const seamlessDomain = domain;
	const settings = get(omProtocolSettings);

	// Build a boundary outline for each sub-layer except the global fallback
	// (last layer), which covers the whole world and needs no border.
	const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
	for (let i = 0; i < seamlessDomain.layers.length - 1; i++) {
		const layer = seamlessDomain.layers[i];
		// Hide the border for a sub-layer whose data isn't available at this lead time.
		if (!layerAvailable(layer.maxForecastHours)) continue;
		const concreteDomain = resolveConcreteDomain(layer.domainValue, settings.domainOptions);
		if (!concreteDomain) continue;

		// Follow the domain's true outline: a precomputed data-shape footprint for
		// NULL-padded reprojected grids, otherwise a curved perimeter for projected
		// grids / the bounds rectangle for plain regular grids.
		//
		// Drawn as a LineString rather than a Polygon: the ring already closes on
		// itself, and a polygon's implicit ring-closing segment would jump ~360°
		// across the map for boundaries that cross the antimeridian or encircle a
		// pole (the perimeter's longitudes are continuous but may exceed ±180°).
		// getDomainBoundary falls back to the grid's boundary polygon itself when
		// a domain has no data-shape footprint.
		const ring = getDomainBoundary(concreteDomain);
		features.push({
			type: 'Feature',
			geometry: {
				type: 'LineString',
				coordinates: ring
			},
			properties: {
				layerIndex: i,
				minZoom: layer.minZoom,
				label: concreteDomain.label ?? concreteDomain.value
			}
		});
	}

	if (features.length === 0) return;

	map.addSource(SEAMLESS_BORDER_SOURCE_ID, {
		type: 'geojson',
		data: { type: 'FeatureCollection', features }
	});

	// Add one line + one symbol MapLibre layer per boundary so each can carry its
	// own zoom-dependent opacity that fades in 2 zoom levels before the sub-domain
	// becomes active (i.e. when its minZoom threshold is reached by the user).
	const lineColor = isDark() ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)';
	const textColor = isDark() ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.75)';
	const textHalo = isDark() ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
	// Highlight colour once the sub-domain becomes active (zoom >= its minZoom).
	const activeLineColor = 'rgba(30,120,255,0.8)';
	const activeTextColor = 'rgba(30,120,255,1)';

	for (const feature of features) {
		const i = feature.properties!.layerIndex as number;
		const minZoom = feature.properties!.minZoom as number;
		// Start fading in 2 zoom levels before the layer becomes active
		const fadeStart = Math.max(0, minZoom - 3);

		// When fadeStart === minZoom (only theoretically possible at minZoom 0),
		// skip the interpolation and show at full opacity immediately.
		const opacityExpr: maplibregl.ExpressionSpecification | number =
			fadeStart < minZoom
				? (['interpolate', ['linear'], ['zoom'], fadeStart, 0, minZoom - 0.5, 1] as const)
				: 1;

		// Turn the border/label blue at the zoom where this sub-domain takes over.
		const lineColorExpr: maplibregl.ExpressionSpecification = [
			'step',
			['zoom'],
			lineColor,
			minZoom - 0.5,
			activeLineColor
		];
		const textColorExpr: maplibregl.ExpressionSpecification = [
			'step',
			['zoom'],
			textColor,
			minZoom - 0.5,
			activeTextColor
		];

		// Dashed bounding-box border
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
