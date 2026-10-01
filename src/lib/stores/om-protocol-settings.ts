import { type Writable, get, writable } from 'svelte/store';

import { BrowserBlockCache } from '@openmeteo/file-reader';
import { defaultOmProtocolSettings } from '@openmeteo/weather-map-layer';
import { persisted } from 'svelte-persisted-store';

import { browser } from '$app/environment';

import {
	DEFAULT_CACHE_BLOCK_SIZE_KB,
	DEFAULT_CACHE_MAX_BYTES_MB,
	DEFAULT_GPU_CACHE_MB,
	HTTP_OVERHEAD_BYTES
} from '$lib/constants';

import { chartSources } from './chart';

import type {
	Data,
	OmProtocolSettings,
	OmUrlState,
	RenderableColorScale,
	WeatherMapLayerFileReader
} from '@openmeteo/weather-map-layer';

export const customColorScales = persisted<Record<string, RenderableColorScale>>(
	'custom-color-scales',
	{}
);

export const cacheBlockSizeKb = persisted('cache-block-size-kb', DEFAULT_CACHE_BLOCK_SIZE_KB);
export const cacheMaxBytesMb = persisted('cache-max-bytes-mb', DEFAULT_CACHE_MAX_BYTES_MB);
// VRAM budget for the GPU layers' value-texture cache: more keeps more
// timesteps resident on the GPU, so animation loops replay without re-uploads.
export const gpuCacheMb = persisted('gpu-cache-mb', DEFAULT_GPU_CACHE_MB);

/** Usage of the shared block cache (RAM/persistent), for the settings pane. */
export const getBlockCacheStats = ():
	| Promise<{
			persistentBytes: number;
			memoryBytes: number;
			maxBytes: number;
	  }>
	| undefined => blockCache?.getStats();

const initialCustomColorScales = get(customColorScales);

function blockCacheOptions() {
	return {
		blockSize: get(cacheBlockSizeKb) * 1024 - HTTP_OVERHEAD_BYTES,
		cacheName: 'open-meteo-maps-cache-v1',
		memCacheTtlMs: 1000,
		maxBytes: get(cacheMaxBytesMb) * 1024 * 1024
	};
}

function createBlockCache() {
	if (!browser) return undefined;
	return new BrowserBlockCache(blockCacheOptions());
}

const blockCache = createBlockCache();

export const omProtocolSettings: Writable<OmProtocolSettings> = writable({
	...defaultOmProtocolSettings,
	// static
	fileReaderConfig: {
		useSAB: true,
		cache: blockCache
	},

	// dynamic (can be changed during runtime)
	colorScales: { ...defaultOmProtocolSettings.colorScales, ...initialCustomColorScales },

	postReadCallback: (_omFileReader: WeatherMapLayerFileReader, data: Data, state: OmUrlState) => {
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

// The protocol keeps at most maxStatesWithData variable states loaded. A chart
// needs one per source, times two while cross-fading between timesteps, plus
// headroom for pan/zoom-created partial-bounds states.
chartSources.subscribe((sources) => {
	omProtocolSettings.update((settings) => ({
		...settings,
		maxStatesWithData: Math.max(4, sources.length * 2)
	}));
});
