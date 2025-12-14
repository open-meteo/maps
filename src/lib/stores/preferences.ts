import { type Writable, writable } from 'svelte/store';

import { setMode } from 'mode-watcher';
import { type Persisted, persisted } from 'svelte-persisted-store';

import {
	mapBounds,
	paddedBounds,
	paddedBoundsGeoJSON,
	paddedBoundsLayer,
	paddedBoundsSource
} from './map';
import { customColorScales } from './om-protocol-settings';
import {
	defaultDomain,
	defaultVariable,
	domain,
	domainSelectionOpen,
	variable,
	variableSelectionExtended,
	variableSelectionOpen
} from './variables';
import { defaultVectorOptions, vectorOptions } from './vector';

import type { DomainMetaData } from '@openmeteo/mapbox-layer';

export const defaultPreferences = {
	globe: false,
	partial: false,
	terrain: false,
	hillshade: false,
	clipWater: false,
	showScale: true,
	timeSelector: true
};

export const preferences = persisted('preferences', defaultPreferences);

// URL object containing current url states setings and flags
export const url: Writable<URL> = writable();

const now = new Date();
now.setHours(now.getHours() + 1, 0, 0, 0);

export const time = writable(new Date(now));
export const modelRun = writable(new Date());

export const sheet = writable(false);
export const loading = writable(false);

export const tileSize: Persisted<128 | 256 | 512> = persisted('tile_size', 256);
export const resolution: Persisted<0.5 | 1 | 2> = persisted('resolution', 1);
// check for retina / hd on first load, afterwards the resolution won't be set
export const resolutionSet = persisted('resolution-set', false);

export const opacity = persisted('opacity', 75);

export const localStorageVersion: Persisted<string | undefined> = persisted(
	'local-storage-version',
	undefined
);

export const helpOpen = writable(false);

export const resetStates = () => {
	preferences.set(defaultPreferences);
	vectorOptions.set(defaultVectorOptions);

	time.set(new Date(now));
	modelRun.set(new Date());
	sheet.set(false);
	loading.set(false);

	domain.set('dwd_icon');
	variable.set('temperature_2m');

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

	opacity.set(75);

	customColorScales.set({});

	setMode('system');
};

export const metaJson: Writable<DomainMetaData | undefined> = writable(undefined);

// used to check against url search parameters
export const completeDefaultValues: { [key: string]: boolean | string | number } = {
	domain: defaultDomain,
	variable: defaultVariable,

	...defaultPreferences,
	...defaultVectorOptions
};
