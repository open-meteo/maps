import { get } from 'svelte/store';

import {
	OMapsFileReader,
	type OmProtocolSettings,
	defaultOmProtocolSettings
} from '@openmeteo/mapbox-layer';

import { customColorScales } from './stores/preferences';

const initialCustomValues = get(customColorScales);
export const omProtocolSettings: OmProtocolSettings = {
	...defaultOmProtocolSettings,
	colorScales: { ...defaultOmProtocolSettings.colorScales, ...initialCustomValues },
	// static
	useSAB: true,

	// could be dynamic
	postReadCallback: (omFileReader: OMapsFileReader, omUrl: string) => {
		if (!omUrl.includes('dwd_icon')) {
			omFileReader._prefetch(omUrl);
		}
	}
};
