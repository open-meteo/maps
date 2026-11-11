/**
 * Chart layer orchestration: turns the active chart's sources into
 * FrameManager channels (one raster and/or one vector channel per source) and
 * shows them as one synchronized frame. Data is shared per variable inside
 * the om protocol, so a raster and vector channel of the same source trigger
 * a single fetch, and toggling contours/arrows re-renders from cached data.
 */
import { get } from 'svelte/store';

import {
	type Domain,
	getDomainBoundary,
	isSeamlessDomain,
	selectSeamlessLayers,
	variableSupportsBarbs
} from '@openmeteo/weather-map-layer';
import * as maplibregl from 'maplibre-gl';
import { mode } from 'mode-watcher';
import { toast } from 'svelte-sonner';

import { chartSources } from '#lib/stores/chart.js';
import { map as m } from '#lib/stores/map.js';
import { loading, opacity, preferences as p } from '#lib/stores/preferences.js';
import { modelRun, time } from '#lib/stores/time.js';
import { selectedDomain } from '#lib/stores/variables.js';
import { vectorOptions as vO } from '#lib/stores/vector.js';

import {
	BEFORE_LAYER_RASTER,
	BEFORE_LAYER_VECTOR,
	BEFORE_LAYER_VECTOR_WATER_CLIP,
	HILLSHADE_LAYER
} from '#lib/constants.js';
import { CommitBarrier, type FrameChannel, FrameManager } from '#lib/frame-manager.js';
import { rasterChannel, vectorChannel } from '#lib/om-layer-defs.js';

import { showCompareFrame, updateCompareBorders } from './compare';
import { refreshPopup } from './popup';
import { omProtocolSettings } from './stores/om-protocol-settings';
import { getOmUrlForSource } from './url';

import type { ChartSource } from '#lib/chart-types.js';

let frameManager: FrameManager | undefined;
/** Main and compare map frames commit in step (see CommitBarrier). */
export const commitBarrier = new CommitBarrier();

const getRasterOpacity = (): number => {
	const opacityValue = get(opacity) / 100;
	return mode.current === 'dark' ? Math.max(0, (opacityValue * 100 - 10) / 100) : opacityValue;
};

/**
 * Build the channels for `sources`, or undefined while not ready. `urlFor`
 * resolves a source's om URL: the main map's path by default, the compare
 * map passes its own domain and time.
 */
export const buildChannels = (
	sources: ChartSource[] = get(chartSources),
	urlFor: (source: ChartSource) => string | undefined = getOmUrlForSource
): FrameChannel[] | undefined => {
	const preferences = get(p);
	const vectorOptions = get(vO);
	const dark = mode.current === 'dark';
	const rasterBefore = preferences.hillshade ? HILLSHADE_LAYER : BEFORE_LAYER_RASTER;
	const vectorBefore = preferences.clipWater ? BEFORE_LAYER_VECTOR_WATER_CLIP : BEFORE_LAYER_VECTOR;

	const channels: FrameChannel[] = [];
	for (const source of sources) {
		const omUrl = urlFor(source);
		if (!omUrl) return undefined;
		const url = 'om://' + omUrl;

		if (source.raster) {
			channels.push(
				rasterChannel(
					source.variable,
					url,
					getRasterOpacity() * (source.opacity ?? 1),
					rasterBefore
				)
			);
		}
		if (source.contours || source.arrows || vectorOptions.grid) {
			channels.push(
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
		barrier: commitBarrier,
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
	// (Re)creating the map layers (initial load or style reload) drops the
	// border layers, so a fresh overlay draws them again
	seamlessBorders = new SeamlessBorderOverlay(map);
	changeOMfileURL();
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
	frameManager?.reanchor(from, to);
};

/**
 * Re-render the active chart. The frame manager deduplicates unchanged
 * render states, so this is safe to call on every store change.
 */
export const changeOMfileURL = (): void => {
	const map = get(m);
	if (!map || !frameManager) return;

	// The compare map shows the same chart, so it re-renders with the main one
	showCompareFrame();

	// `undefined` means a source is not ready yet; an empty list means the chart
	// deliberately draws nothing, which the frame manager commits as a blank
	// frame and fades the previous one out
	const channels = buildChannels();
	if (!channels) return;

	frameManager.show(channels);
	updateSeamlessBorderLayer();
};

// =============================================================================
// Seamless domain border overlay
// =============================================================================

const SEAMLESS_BORDER_SOURCE_ID = 'seamlessBorderSource';

const isDark = (): boolean => mode.current === 'dark';

/**
 * Dashed outline and label of every regional sub-domain a seamless composite
 * shows, on one map: the main map's for its domain and time, the compare
 * map's for the compared ones.
 */
export class SeamlessBorderOverlay {
	// Tracks what the borders were last drawn for, so repeated calls (e.g. on
	// every timestep change via changeOMfileURL) don't needlessly remove +
	// re-add the layers — which restarts their fade-in transition and makes
	// them flash.
	private lastSignature: string | null = null;

	constructor(private readonly map: maplibregl.Map) {}

	private remove(): void {
		const map = this.map;
		// Collect IDs first to avoid mutating the layer list while iterating
		const toRemove = (map.getStyle()?.layers ?? [])
			.map((l) => l.id)
			.filter((id) => id.startsWith('seamless-border-'));
		for (const id of toRemove) {
			if (map.getLayer(id)) map.removeLayer(id);
		}
		if (map.getSource(SEAMLESS_BORDER_SOURCE_ID)) map.removeSource(SEAMLESS_BORDER_SOURCE_ID);
	}

	/**
	 * Draw the borders for `domain` at `leadTimeHours` into its run, or none
	 * when the preference is off or the domain is no composite.
	 */
	update(domain: Domain, leadTimeHours: number | undefined): void {
		const map = this.map;
		const preferences = get(p);
		const draw = preferences.showSeamlessBorders && isSeamlessDomain(domain);

		// Only sub-domains the protocol would load at the selected time get a
		// border: past its forecast horizon a regional model drops out of the
		// composite, so its border must disappear too. The base layer (the last
		// one) covers the composite's whole extent and needs none.
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
		if (signature === this.lastSignature) return;
		this.lastSignature = signature;

		this.remove();
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
	}
}

let seamlessBorders: SeamlessBorderOverlay | undefined;

/** The main map's borders for its domain at the selected time. */
export const updateSeamlessBorderLayer = (): void => {
	const modelRunDate = get(modelRun);
	const validTime = get(time);
	const leadTimeHours =
		modelRunDate && validTime
			? (validTime.getTime() - modelRunDate.getTime()) / 3_600_000
			: undefined;
	seamlessBorders?.update(get(selectedDomain), leadTimeHours);
	// The settings toggle lands here, so the compare map's follow from here too
	updateCompareBorders();
};

/**
 * om:// source URL per source variable of the frame `manager` shows, in
 * chart source order (used by the popup).
 */
export const activeOmUrlsOf = (manager: FrameManager | undefined): Map<string, string> => {
	const urls = new Map<string, string>();
	for (const channel of manager?.getActiveChannels() ?? []) {
		// Channel keys are `${variable}:kind:...`; variables contain no colon
		const key = channel.key.slice(0, channel.key.indexOf(':'));
		if (!urls.has(key)) urls.set(key, channel.url);
	}
	return urls;
};

/** `activeOmUrlsOf` the main map's frame. */
export const getActiveOmUrls = (): Map<string, string> => activeOmUrlsOf(frameManager);
