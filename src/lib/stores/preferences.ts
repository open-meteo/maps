import { type Writable, writable } from 'svelte/store';

import { domainOptions, variableOptions } from '@openmeteo/mapbox-layer';
import { type Persisted, persisted } from 'svelte-persisted-store';

export const preferences = persisted('preferences', {
	globe: false,
	partial: false,
	terrain: false,
	hillshade: false,
	clipWater: false,
	showScale: true,
	timeSelector: true
});

export const vectorOptions = persisted('vector-options', {
	grid: false,
	arrows: true,
	contours: false,
	contourInterval: 2
});

export const domain = persisted(
	'domain',
	domainOptions.find((dm) => dm.value === import.meta.env.VITE_DOMAIN) ?? domainOptions[0]
);

export const variables = persisted('variables', [
	variableOptions.find((v) => v.value === import.meta.env.VITE_VARIABLE) ?? variableOptions[0]
]);

export const pressureLevels = persisted('pressure-levels', [2]);

const now = new Date();
now.setHours(now.getHours() + 1, 0, 0, 0);

export const time = writable(new Date(now));
export const modelRun = writable(new Date());

export const sheet = writable(false);
export const loading = writable(false);

export const domainSelectionOpen = writable(false);
export const variableSelectionOpen = writable(false);
export const pressureLevelsSelectionOpen = writable(false);

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

export const tileSize: Persisted<128 | 256 | 512> = persisted('tile-size', 256);
export const resolution: Persisted<0.5 | 1 | 2> = persisted('resolution', 1);
