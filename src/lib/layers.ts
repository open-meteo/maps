/**
 * Chart layer orchestration: turns the active chart's sources into
 * FrameManager channels (one raster and/or one vector channel per source) and
 * shows them as one synchronized frame. Data is shared per variable inside
 * the om protocol, so a raster and vector channel of the same source trigger
 * a single fetch, and toggling contours/arrows re-renders from cached data.
 */
import { get } from 'svelte/store';

import {
	getDomainBoundary,
	isSeamlessDomain,
	selectSeamlessLayers,
	variableSupportsBarbs
} from '@openmeteo/weather-map-layer';
import L from 'leaflet';
import { mode } from 'mode-watcher';
import { toast } from 'svelte-sonner';

import { chartSources } from '$lib/stores/chart';
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

import { VECTOR_PANE, ZOOM_OFFSET } from './map-controls';
import { refreshPopup } from './popup';
import { omProtocolSettings } from './stores/om-protocol-settings';
import { getOmUrlForSource } from './url';

let frameManager: FrameManager | undefined;

const getRasterOpacity = (): number => {
	const opacityValue = get(opacity) / 100;
	return mode.current === 'dark' ? Math.max(0, (opacityValue * 100 - 10) / 100) : opacityValue;
};

/** Build the channels for the current chart, or undefined while not ready. */
const buildChannels = (): FrameChannel[] | undefined => {
	const sources = get(chartSources);
	const preferences = get(p);
	const vectorOptions = get(vO);
	const dark = mode.current === 'dark';
	const rasterBefore = preferences.hillshade ? HILLSHADE_LAYER : BEFORE_LAYER_RASTER;
	const vectorBefore = preferences.clipWater ? BEFORE_LAYER_VECTOR_WATER_CLIP : BEFORE_LAYER_VECTOR;

	const channels: FrameChannel[] = [];
	for (const source of sources) {
		const omUrl = getOmUrlForSource(source);
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

const isDark = (): boolean => mode.current === 'dark';

/**
 * Border polylines currently on the map, each with the zoom (MapLibre scale,
 * like the domain table) at which its sub-domain takes over the composite
 * and the zoom its border starts fading in.
 */
let borderLines: { line: L.Polyline; activeZoom: number; fadeStart: number }[] = [];
let borderGroup: L.LayerGroup | undefined;

/**
 * Leaflet has no zoom-driven paint expressions, so the zoom-dependent look is
 * applied by hand on every zoom: tiles of zoom `minZoom` are shown from map
 * zoom minZoom - 0.5, so that is where the sub-domain takes over and its
 * border switches to the highlight colour; before that it fades in over the
 * 2.5 zoom levels leading up to it, announcing the finer model ahead of the
 * switch.
 */
const restyleSeamlessBorders = (): void => {
	const map = get(m);
	if (!map) return;
	const zoom = map.getZoom() - ZOOM_OFFSET;
	const lineColor = isDark() ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)';
	// Highlight colour once the sub-domain is active
	const activeLineColor = 'rgba(30,120,255,0.8)';
	for (const { line, activeZoom, fadeStart } of borderLines) {
		const fade = (zoom - fadeStart) / (activeZoom - fadeStart);
		line.setStyle({
			color: zoom >= activeZoom ? activeLineColor : lineColor,
			opacity: fadeStart < activeZoom ? Math.min(1, Math.max(0, fade)) : 1
		});
	}
};

const removeSeamlessBorderLayer = (): void => {
	get(m)?.off('zoomend', restyleSeamlessBorders);
	borderGroup?.remove();
	borderGroup = undefined;
	borderLines = [];
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
	// Drawn as an open polyline rather than a polygon: the ring already closes
	// on itself, and a polygon's implicit ring-closing segment would jump ~360°
	// across the map for boundaries that cross the antimeridian or encircle a
	// pole (the perimeter's longitudes are continuous but may exceed ±180°).
	// Only the dashed outline is drawn; the MapLibre app's domain-name labels
	// running along the line have no Leaflet equivalent.
	borderLines = regionalLayers.map(({ layer, domain: concreteDomain }) => ({
		line: L.polyline(
			getDomainBoundary(concreteDomain).map(([lng, lat]) => L.latLng(lat, lng)),
			{ pane: VECTOR_PANE, weight: 1.5, dashArray: '4 3', interactive: false }
		),
		activeZoom: layer.minZoom - 0.5,
		fadeStart: Math.max(0, layer.minZoom - 3)
	}));
	borderGroup = L.layerGroup(borderLines.map(({ line }) => line)).addTo(map);
	restyleSeamlessBorders();
	map.on('zoomend', restyleSeamlessBorders);
};

/**
 * om:// source URL per source variable of the currently visible frame, in
 * chart source order (used by the popup).
 */
export const getActiveOmUrls = (): Map<string, string> => {
	const urls = new Map<string, string>();
	for (const channel of frameManager?.getActiveChannels() ?? []) {
		// Channel keys are `${variable}:kind:...`; variables contain no colon
		const key = channel.key.slice(0, channel.key.indexOf(':'));
		if (!urls.has(key)) urls.set(key, channel.url);
	}
	return urls;
};
