import { get } from 'svelte/store';

import { BrowserBlockCache } from '@openmeteo/file-reader';
import { type OMapsFileReader, defaultOmProtocolSettings } from '@openmeteo/mapbox-layer';
import { persisted } from 'svelte-persisted-store';

import { browser } from '$app/environment';

import { getNextOmUrls } from '$lib';
import { DEFAULT_COLOR_HASH } from '$lib/constants';

import { metaJson } from './time';
import { selectedDomain } from './variables';

import type {
	Data,
	OmProtocolSettings,
	OmUrlState,
	RenderableColorScale
} from '@openmeteo/mapbox-layer';

export const defaultColorHash = DEFAULT_COLOR_HASH;

export const customColorScales = persisted<Record<string, RenderableColorScale>>(
	'custom-color-scales',
	{}
);

const initialCustomColorScales = get(customColorScales);
export const omProtocolSettings: OmProtocolSettings = {
	...defaultOmProtocolSettings,
	// static
	fileReaderConfig: {
		useSAB: true,
		cache: browser
			? new BrowserBlockCache({
					blockSize: 128 * 1024,
					cacheName: 'mapbox-layer-cache',
					memCacheTtlMs: 1000,
					maxBytes: 400 * 1024 * 1024 // 400Mb maximum storage
				})
			: undefined
	},

	// dynamic (can be changed during runtime)
	colorScales: { ...defaultOmProtocolSettings.colorScales, ...initialCustomColorScales },

	postReadCallback: (omFileReader: OMapsFileReader, data: Data, state: OmUrlState) => {
		// dwd icon models are cached locally on server
		if (!state.dataOptions.domain.value.startsWith('dwd_icon')) {
			// const nextOmUrls = getNextOmUrls(state.omFileUrl, get(selectedDomain), get(metaJson));
			// for (const nextOmUrl of nextOmUrls) {
			// 	if (nextOmUrl === undefined) continue;
			// 	if (!omFileReader.hasFileOpen(nextOmUrl)) {
			// 		fetch(nextOmUrl, {
			// 			method: 'GET',
			// 			headers: {
			// 				Range: 'bytes=0-255' // Just fetch first 256 bytes to trigger caching
			// 			}
			// 		}).catch(() => {
			// 			// Silently ignore errors for prefetches
			// 		});
			// 	}
			// }
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
};
