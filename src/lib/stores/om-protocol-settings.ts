import { type Writable, get, writable } from 'svelte/store';

import { BrowserBlockCache } from '@openmeteo/file-reader';
import {
	WeatherMapLayerFileReader,
	defaultOmProtocolSettings,
	isSeamlessDomain
} from '@openmeteo/weather-map-layer';
import { persisted } from 'svelte-persisted-store';

import { browser } from '$app/environment';

import {
	DEFAULT_CACHE_BLOCK_SIZE_KB,
	DEFAULT_CACHE_MAX_BYTES_MB,
	HTTP_OVERHEAD_BYTES
} from '$lib/constants';
import { getNextOmUrls, getSeamlessWarmupOmUrls } from '$lib/url';

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

// Dedicated reader used only to warm the cache. It shares the same BlockCache as
// the protocol's main reader (so warming populates the cache the real reads use),
// but keeps its own OmFileReader: fetching a file header here never disturbs the
// file the main reader is mid-read on — important for the sequential seamless
// sub-layer loads, which would otherwise race on a shared, stateful reader.
const prefetchReader = browser
	? new WeatherMapLayerFileReader({ useSAB: true, cache: blockCache })
	: undefined;

// setToOmFile() is stateful, so warm-ups are serialized through a single promise
// chain; concurrent calls on the shared prefetchReader would clobber each other.
// `warmedUrls` skips files already warmed this session (bounded to cap memory).
const warmedUrls = new Set<string>();
let warmChain: Promise<void> = Promise.resolve();
const warmOmUrl = (url: string): void => {
	if (!prefetchReader || warmedUrls.has(url)) return;
	if (warmedUrls.size > 1024) warmedUrls.clear();
	warmedUrls.add(url);
	warmChain = warmChain.then(async () => {
		try {
			await prefetchReader.setToOmFile(url);
			// Touches the file header/tail only; no real variable is requested.
			await prefetchReader.prefetchVariable('not_a_real_variable');
		} catch {
			// A sub-layer may have no file for this timestep (e.g. beyond its forecast
			// horizon, or a model run that has not published yet). Warming is
			// best-effort, so swallow failures.
		}
	});
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
		// Only fires for regular (non-seamless) domains — the seamless protocol never
		// runs this callback. Seamless cache warming is driven by warmSeamlessSubLayers
		// on timestep/domain change instead (see below).
		const nextOmUrls = getNextOmUrls(state.omFileUrl, get(selectedDomain), get(metaJson));
		for (const nextOmUrl of nextOmUrls) {
			if (nextOmUrl === undefined) continue;
			omFileReader.setToOmFile(nextOmUrl);
			// This will trigger a request to the tail of the file and cache it
			// Not requesting a real variable ensures that we don't request any additional data.
			omFileReader.prefetchVariable('not_a_real_variable');
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

/**
 * Warm the cache (file headers) for every concrete sub-layer of the currently
 * selected seamless composite — including ones the viewport gate skips because
 * they are off-screen — across the previous/current/next timesteps, so panning to
 * a regional model and stepping through time are instant. Sub-layer data itself is
 * still loaded on demand by the protocol, only when in view.
 *
 * Driven by the app on timestep/domain change (see layers.ts) rather than the
 * protocol's postReadCallback: the seamless load path is per-tile and runs once
 * per raster AND per vector request, so hooking it there fired redundantly. A
 * no-op for non-seamless domains.
 */
export const warmSeamlessSubLayers = (): void => {
	const domain = get(selectedDomain);
	if (!isSeamlessDomain(domain)) return;
	for (const url of getSeamlessWarmupOmUrls(domain, get(metaJson))) {
		warmOmUrl(url);
	}
};
