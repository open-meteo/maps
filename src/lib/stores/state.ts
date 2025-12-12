import { type Writable, writable } from 'svelte/store';
import { get } from 'svelte/store';

import {
	OMapsFileReader,
	type OmProtocolSettings,
	defaultOmProtocolSettings
} from '@openmeteo/mapbox-layer';

import { getNextOmUrls } from '$lib';

import { customColorScales, selectedDomain } from './preferences';

import type { Data, DomainMetaData, OmUrlState } from '@openmeteo/mapbox-layer';

export const metaJson: Writable<DomainMetaData | undefined> = writable(undefined);

const initialCustomValues = get(customColorScales);
export const omProtocolSettings: OmProtocolSettings = {
	...defaultOmProtocolSettings,
	colorScales: { ...defaultOmProtocolSettings.colorScales, ...initialCustomValues },
	// static
	useSAB: true,

	// could be dynamic
	// dynamic (can be changed during runtime)
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
};
