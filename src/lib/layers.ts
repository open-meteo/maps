/**
 * Chart layer orchestration: turns the active chart's sources into
 * FrameManager channels (one raster and/or one vector channel per source) and
 * shows them as one synchronized frame. Data is shared per variable inside
 * the om protocol, so a raster and vector channel of the same source trigger
 * a single fetch, and toggling contours/arrows re-renders from cached data.
 */
import { get } from 'svelte/store';

import { getDataState } from '@openmeteo/weather-map-layer';
import { mode } from 'mode-watcher';
import { toast } from 'svelte-sonner';

import { chartSources } from '$lib/stores/chart';
import { map as m } from '$lib/stores/map';
import { loading, opacity, preferences as p } from '$lib/stores/preferences';
import { vectorOptions as vO } from '$lib/stores/vector';

import { sourceKey } from '$lib/chart-encoding';
import {
	BEFORE_LAYER_RASTER,
	BEFORE_LAYER_VECTOR,
	BEFORE_LAYER_VECTOR_WATER_CLIP,
	HILLSHADE_LAYER
} from '$lib/constants';
import { type FrameChannel, FrameManager } from '$lib/frame-manager';
import { rasterChannel, vectorChannel } from '$lib/om-layer-defs';

import { refreshPopup } from './popup';
import { getOmUrlForSource, getSunUrl } from './url';

import type { RasterTileSource } from 'maplibre-gl';

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
		// A cross-domain (EPS) source is skipped rather than fatal while its
		// sibling metadata loads; the epsMeta subscription re-renders then.
		if (!omUrl) {
			if (source.domain) continue;
			return undefined;
		}
		const url = 'om://' + omUrl;

		if (source.raster) {
			channels.push(
				rasterChannel(
					sourceKey(source),
					url,
					getRasterOpacity() * (source.opacity ?? 1),
					rasterBefore
				)
			);
		}
		if (source.contours || source.arrows || vectorOptions.grid) {
			channels.push(
				vectorChannel(sourceKey(source), url, {
					contours: !!source.contours,
					arrows: !!source.arrows,
					arrowStyle: vectorOptions.arrowStyle,
					arrowRender: vectorOptions.arrowRender,
					arrowIconScale: vectorOptions.arrowIconScale,
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
		getChannelDataState: getDataState,
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
	// A style reload wiped the sun source with everything else; forget the URL
	// so updateSunLayer re-adds the layer instead of considering it unchanged.
	currentSunUrl = undefined;
	changeOMfileURL();
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

	// The sun overlay only depends on the map, the selected time and its own
	// settings, so it updates even while chart sources are not ready yet.
	updateSunLayer();

	// `undefined` means a source is not ready yet; an empty list means the chart
	// deliberately draws nothing, which the frame manager commits as a blank
	// frame and fades the previous one out
	const channels = buildChannels();
	if (!channels) return;

	frameManager.show(channels);
};

/**
 * om:// source URL per source key (`variable` or `variable@domain`) of the
 * currently visible frame, in chart source order (used by the popup).
 */
export const getActiveOmUrls = (): Map<string, string> => {
	const urls = new Map<string, string>();
	for (const channel of frameManager?.getActiveChannels() ?? []) {
		// Channel keys are `${sourceKey}:kind:...`; source keys contain no colon
		const key = channel.key.slice(0, channel.key.indexOf(':'));
		if (!urls.has(key)) urls.set(key, channel.url);
	}
	return urls;
};

// =============================================================================
// Sun cycle shadow overlay
// =============================================================================
// A single analytical raster layer above the weather layers, below the place
// labels. Managed directly rather than through the frame manager: it has no
// timestep frames — the source URL simply retargets when the selected time or
// the shadow settings change.

const SUN_SOURCE_ID = 'sunShadowSource';
const SUN_LAYER_ID = 'sunShadowLayer';
let currentSunUrl: string | undefined;
let lastSunPreviewUrl: string | undefined;

export const updateSunLayer = (): void => {
	const map = get(m);
	if (!map) return;

	const sunUrl = getSunUrl();
	if (sunUrl === currentSunUrl) return;
	currentSunUrl = sunUrl;
	lastSunPreviewUrl = undefined;

	if (!sunUrl) {
		if (map.getLayer(SUN_LAYER_ID)) map.removeLayer(SUN_LAYER_ID);
		if (map.getSource(SUN_SOURCE_ID)) map.removeSource(SUN_SOURCE_ID);
		return;
	}

	const source = map.getSource(SUN_SOURCE_ID) as RasterTileSource | undefined;
	if (source) {
		// Retarget the existing source; see previewSunTime for why setUrl.
		source.setUrl(sunUrl);
		return;
	}

	map.addSource(SUN_SOURCE_ID, { url: sunUrl, type: 'raster' });
	map.addLayer(
		{
			id: SUN_LAYER_ID,
			type: 'raster',
			source: SUN_SOURCE_ID,
			// The shadow opacity is baked into the tile alpha, so the layer stays at 1.
			paint: { 'raster-opacity': 1 }
		},
		BEFORE_LAYER_VECTOR
	);
};

// Retargets the active sun source to another moment (minute resolution) without
// replacing the layer — cheap enough to follow the time-selector hover. Passing
// null snaps back to the selected time. Uses setUrl, not setTiles: for
// url-based sources the tilejson refetch would restore the old template over
// setTiles.
export const previewSunTime = (date: Date | null): void => {
	const map = get(m);
	if (!map || !currentSunUrl) return;

	const sunUrl = getSunUrl(date ?? undefined);
	if (!sunUrl || sunUrl === lastSunPreviewUrl) return;

	const source = map.getSource(SUN_SOURCE_ID) as RasterTileSource | undefined;
	if (!source) return;

	lastSunPreviewUrl = sunUrl;
	source.setUrl(sunUrl);
};
