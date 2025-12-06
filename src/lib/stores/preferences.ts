import { type Writable, get, writable } from 'svelte/store';

import { domainOptions, variableOptions } from '@openmeteo/mapbox-layer';
import { type Persisted, persisted } from 'svelte-persisted-store';

const defaultPreferences = {
	globe: false,
	partial: false,
	terrain: false,
	hillshade: false,
	clipWater: false,
	showScale: true,
	timeSelector: true
};

export const preferences = persisted('preferences', defaultPreferences);

const defaultVectorOptions = {
	grid: false,
	arrows: true,
	contours: false,
	contourInterval: 2
};

export const vectorOptions = persisted('vector-options', defaultVectorOptions);

const defaultDomain =
	domainOptions.find((dm) => dm.value === import.meta.env.VITE_DOMAIN) ?? domainOptions[0];

export const domain = persisted('domain', defaultDomain);

const defaultVariable =
	variableOptions.find((v) => v.value === import.meta.env.VITE_VARIABLE) ?? variableOptions[0];

export const variables = persisted('variables', [defaultVariable]);

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
	false
);

export const mapBounds: Writable<maplibregl.LngLatBounds | null> = writable(null);

export const paddedBounds: Writable<maplibregl.LngLatBounds | null> = writable(null);
export const paddedBoundsLayer: Writable<maplibregl.StyleLayer | undefined> = writable(undefined);
export const paddedBoundsSource: Writable<maplibregl.GeoJSONSource | undefined> =
	writable(undefined);
export const paddedBoundsGeoJSON: Writable<GeoJSON.GeoJSON | null> = writable(null);

export const tileSize: Persisted<128 | 256 | 512> = persisted('tile-size', 256);
export const resolution: Persisted<0.5 | 1 | 2> = persisted('resolution', 1);

export const localStorageVersion = persisted('local-storage-version', '');

export const resetStates = () => {
	console.log(get(vectorOptions));
	preferences.set(defaultPreferences);
	vectorOptions.set(defaultVectorOptions);

	domain.set(defaultDomain);
	variables.set([defaultVariable]);

	time.set(new Date(now));
	modelRun.set(new Date()); // Does this work?
	sheet.set(false);
	loading.set(false); // Does this work?

	domainSelectionOpen.set(false);
	variableSelectionOpen.set(false);
	variableSelectionExtended.set(false);

	mapBounds.set(null);
	paddedBounds.set(null);
	paddedBoundsLayer.set(undefined);
	paddedBoundsSource.set(undefined);
	paddedBoundsGeoJSON.set(null);

	tileSize.set(256);
	resolution.set(1);
};
