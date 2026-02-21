import { type Writable, get, writable } from 'svelte/store';

import { BrowserBlockCache } from '@openmeteo/file-reader';
import { type MapboxLayerFileReader, defaultOmProtocolSettings } from '@openmeteo/mapbox-layer';
import { persisted } from 'svelte-persisted-store';

import { browser } from '$app/environment';

import { DEFAULT_COLOR_HASH } from '$lib/constants';
import { getNextOmUrls } from '$lib/url';

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
export const omProtocolSettings: Writable<OmProtocolSettings> = writable({
	...defaultOmProtocolSettings,
	// static
	fileReaderConfig: {
		useSAB: true,
		cache: browser
			? new BrowserBlockCache({
					blockSize: 128 * 1024,
					cacheName: 'open-meteo-maps-cache-v1',
					memCacheTtlMs: 1000,
					maxBytes: 400 * 1024 * 1024 // 400Mb maximum storage
				})
			: undefined
	},

	// dynamic (can be changed during runtime)
	colorScales: { ...defaultOmProtocolSettings.colorScales, ...initialCustomColorScales },

	postReadCallback: (omFileReader: MapboxLayerFileReader, data: Data, state: OmUrlState) => {
		// dwd icon models are cached locally on server
		if (!state.dataOptions.domain.value.startsWith('dwd_icon')) {
			const nextOmUrls = getNextOmUrls(state.omFileUrl, get(selectedDomain), get(metaJson));
			for (const nextOmUrl of nextOmUrls) {
				if (nextOmUrl === undefined) continue;
				omFileReader.setToOmFile(nextOmUrl);
				// This will trigger a request to the tail of the file and cache it
				// Not requesting a real variable ensures that we don't request any additional data.
				omFileReader.prefetchVariable('not_a_real_variable');
			}
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
