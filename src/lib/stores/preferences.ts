import { type Writable, derived, writable } from 'svelte/store';

import { domainOptions, variableOptions } from '@openmeteo/mapbox-layer';
import { setMode } from 'mode-watcher';
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

export const domain = persisted('domain', 'dwd_icon');
export const variable = persisted('variable', 'temperature_2m');

export const selectedDomain = derived(domain, ($domain) => {
	const object = domainOptions.find(({ value }) => value === $domain);
	if (object) {
		return object;
	} else {
		throw new Error('Domain not found');
	}
});
export const selectedVariable = derived(variable, ($variable) => {
	const object = variableOptions.find(({ value }) => value === $variable);
	if (object) {
		return object;
	} else {
		// Throwing an error here is not the preferred thing to do!
		// Instead we use the selected variable as a label as well.
		return {
			value: $variable,
			label: $variable
		};
	}
});
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
export const variableSelectionExtended = persisted('variables-open', false);

export const mapBounds: Writable<maplibregl.LngLatBounds | null> = writable(null);
export const paddedBounds: Writable<maplibregl.LngLatBounds | null> = writable(null);
export const paddedBoundsLayer: Writable<maplibregl.StyleLayer | undefined> = writable(undefined);
export const paddedBoundsSource: Writable<maplibregl.GeoJSONSource | undefined> =
	writable(undefined);
export const paddedBoundsGeoJSON: Writable<GeoJSON.GeoJSON | null> = writable(null);

export const tileSize: Persisted<128 | 256 | 512> = persisted('tile-size', 256);
export const resolution: Persisted<0.5 | 1 | 2> = persisted('resolution', 1);
// check for retina on first load, and set the resolution to 2
export const resolutionSet = persisted('resolution-set', false);

export const localStorageVersion: Persisted<string | undefined> = persisted(
	'local-storage-version',
	undefined
);

export const resetStates = () => {
	preferences.set(defaultPreferences);
	vectorOptions.set(defaultVectorOptions);

	domain.set('dwd_icon');
	variable.set('temperature_2m');

	time.set(new Date(now));
	modelRun.set(new Date());
	sheet.set(false);
	loading.set(false);

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
	resolutionSet.set(false);

	setMode('system');
};
