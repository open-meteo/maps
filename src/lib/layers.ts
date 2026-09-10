/**
 * Layer orchestration: turns the active om url into FrameManager channels (a
 * raster fill and, when contours/arrows/grid are on, a vector channel) and
 * shows them as one synchronized frame. Data is shared per variable inside
 * the om protocol, so both channels of a source trigger a single fetch, and
 * toggling contours/arrows re-renders from cached data.
 */
import { get } from 'svelte/store';

import { getDataState } from '@openmeteo/weather-map-layer';
import { mode } from 'mode-watcher';
import { toast } from 'svelte-sonner';

import { map as m } from '$lib/stores/map';
import { loading, opacity, preferences as p } from '$lib/stores/preferences';
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
	changeOMfileURL();
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
};

/** om:// source url of the currently visible frame (used by the popup). */
export const getActiveOmUrl = (): string | undefined => frameManager?.getActiveChannels()[0]?.url;
