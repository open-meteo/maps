import { writable, type Writable } from 'svelte/store';

import { persisted, type Persisted } from 'svelte-persisted-store';

import { domainOptions } from '@openmeteo/mapbox-layer/dist/utils/domains';
import { variableOptions } from '@openmeteo/mapbox-layer/dist/utils/variables';

export const preferences = persisted('preferences', {
	// buttons
	globe: false,
	partial: false,
	terrain: false,
	hillshade: false,
	showScale: true,
	timeSelector: true
});

export const domain = persisted(
	'domain',
	domainOptions.find((dm) => dm.value === import.meta.env.VITE_DOMAIN) ?? domainOptions[0]
);

export const variables = persisted('variables', [
	variableOptions.find((v) => v.value === import.meta.env.VITE_VARIABLE) ?? variableOptions[0]
]);

const now = new Date();
now.setHours(now.getHours() + 1, 0, 0, 0);

export const time = writable(new Date(now));
export const modelRun = writable(new Date());

export const sheet = writable(false);
export const loading = writable(false);

export const domainSelectionOpen = writable(false);
export const variableSelectionOpen = writable(false);
export const variableSelectionExtended: Persisted<boolean | undefined> = persisted(
	'variables-open',
	undefined
);

export const mapBounds: Writable<maplibregl.LngLatBounds | null> = writable(null);

export const paddedBounds: Writable<maplibregl.LngLatBounds | null> = writable(null);
export const paddedBoundsLayer: Writable<maplibregl.StyleLayer | undefined> = writable(undefined);
export const paddedBoundsSource: Writable<maplibregl.GeoJSONSource | undefined> =
	writable(undefined);
export const paddedBoundsGeoJSON: Writable<GeoJSON.GeoJSON | null> = writable(null);
