import { type Writable, get, writable } from 'svelte/store';

import { type OMapsFileReader, defaultOmProtocolSettings } from '@openmeteo/mapbox-layer';
import { persisted } from 'svelte-persisted-store';

import { getNextOmUrls } from '$lib';
import { DEFAULT_COLOR_HASH } from '$lib/constants';

import { metaJson } from './preferences';
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
	useSAB: true,

	// dynamic (can be changed during runtime)
	colorScales: { ...defaultOmProtocolSettings.colorScales, ...initialCustomColorScales },

	postReadCallback: (omFileReader: OMapsFileReader, data: Data, state: OmUrlState) => {
		// dwd icon models are cached locally on server
		if (!state.dataOptions.domain.value.startsWith('dwd_icon')) {
			const nextOmUrls = getNextOmUrls(state.omFileUrl, get(selectedDomain), get(metaJson));
			if (nextOmUrls) {
				for (const nextOmUrl of nextOmUrls) {
					if (!omFileReader.hasFileOpen(nextOmUrl)) {
						fetch(nextOmUrl, {
							method: 'GET',
							headers: {
								Range: 'bytes=0-255' // Just fetch first 256 bytes to trigger caching
							}
						}).catch(() => {
							// Silently ignore errors for prefetches
						});
					}
				}
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
