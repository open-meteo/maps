import { type Writable, get, writable } from 'svelte/store';

import { BrowserBlockCache } from '@openmeteo/file-reader';
import { WeatherMapLayerFileReader, defaultOmProtocolSettings } from '@openmeteo/weather-map-layer';
import { persisted } from 'svelte-persisted-store';

import { browser } from '$app/environment';

import {
	DEFAULT_CACHE_BLOCK_SIZE_KB,
	DEFAULT_CACHE_MAX_BYTES_MB,
	HTTP_OVERHEAD_BYTES
} from '$lib/constants';
import { getNextOmUrls } from '$lib/url';

import { metaJson } from './time';
import { selectedDomain } from './variables';

import type {
	Data,
	OmProtocolSettings,
	OmUrlState,
	RenderableColorScale
} from '@openmeteo/weather-map-layer';

export const customColorScales = persisted<Record<string, RenderableColorScale>>(
	'custom-color-scales',
	{}
);

export const cacheBlockSizeKb = persisted('cache-block-size-kb', DEFAULT_CACHE_BLOCK_SIZE_KB);
export const cacheMaxBytesMb = persisted('cache-max-bytes-mb', DEFAULT_CACHE_MAX_BYTES_MB);

const initialCustomColorScales = get(customColorScales);

function createBlockCache() {
	if (!browser) return undefined;
	return new BrowserBlockCache({
		blockSize: get(cacheBlockSizeKb) * 1024 - HTTP_OVERHEAD_BYTES,
		cacheName: 'open-meteo-maps-cache-v1',
		memCacheTtlMs: 1000,
		maxBytes: get(cacheMaxBytesMb) * 1024 * 1024
	});
}

const blockCache = createBlockCache();

// Skips files already warmed this session (bounded to cap memory). warmFile()
// is atomic and cheap once cached, but for seamless composites the callback
// fires once per sub-layer, so deduping avoids re-warming the same grid of
// (sub-layer × timestep) URLs on every load.
const warmedUrls = new Set<string>();
const warmOmUrl = (omFileReader: WeatherMapLayerFileReader, url: string): void => {
	if (warmedUrls.has(url)) return;
	if (warmedUrls.size > 1024) warmedUrls.clear();
	warmedUrls.add(url);
	// Caches the file header/trailer and root metadata without requesting any
	// variable data. Best-effort: a sub-layer may have no file for this timestep
	// (e.g. beyond its forecast horizon, or a model run that has not published
	// yet), so swallow failures.
	omFileReader.warmFile(url).catch(() => {});
};

export const omProtocolSettings: Writable<OmProtocolSettings> = writable({
	...defaultOmProtocolSettings,
	// static
	fileReaderConfig: {
		useSAB: true,
		cache: blockCache
	},

	// dynamic (can be changed during runtime)
	colorScales: { ...defaultOmProtocolSettings.colorScales, ...initialCustomColorScales },

	postReadCallback: (omFileReader: WeatherMapLayerFileReader, data: Data, state: OmUrlState) => {
		// Fires once per real data load for both regular and seamless domains. For a
		// seamless composite, getNextOmUrls(selectedDomain) expands to every concrete
		// sub-layer URL — including off-screen ones the viewport gate skips — across the
		// current/previous/next timesteps, so panning to a regional model and stepping
		// through time stay instant. warmOmUrl dedupes, so multiple sub-layers firing
		// this callback per composite is cheap.
		for (const nextOmUrl of getNextOmUrls(get(selectedDomain), get(metaJson))) {
			warmOmUrl(omFileReader, nextOmUrl);
		}
		if (
			state.dataOptions.domain.value === 'ecmwf_ifs' &&
			state.dataOptions.variable === 'pressure_msl'
		) {
			if (data.values) {
				data.values = data.values?.map((value) => value / 100);
			}
		}
	}
});
