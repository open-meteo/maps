import { type Writable, writable } from 'svelte/store';

import { setMode } from 'mode-watcher';
import { type Persisted, persisted } from 'svelte-persisted-store';

import { getInitialMetaData, getMetaData } from '$lib';

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

import type { DomainMetaDataJson } from '@openmeteo/mapbox-layer';

export const defaultPreferences = {
	globe: false,
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
now.setUTCHours(now.getUTCHours() + 1, 0, 0, 0);

export const time = writable(new Date(now));
export const modelRun: Writable<Date | undefined> = writable(undefined);

export const sheet = writable(false);
export const loading = writable(false);

export const tileSize: Persisted<128 | 256 | 512> = persisted('tile_size', 256);
export const resolution: Persisted<0.5 | 1 | 2> = persisted('resolution', 1);
// check for retina / hd on first load, afterwards the resolution won't be set
export const resolutionSet = persisted('resolution-set', false);

export const opacity = persisted('opacity', 75);

export const latest: Writable<DomainMetaDataJson | undefined> = writable(undefined);
export const inProgress: Writable<DomainMetaDataJson | undefined> = writable(undefined);

export const localStorageVersion: Persisted<string | undefined> = persisted(
	'local-storage-version',
	undefined
);

export const helpOpen = writable(false);

export const metaJson: Writable<DomainMetaDataJson | undefined> = writable(undefined);
export const modelRunLocked = writable(false);

export const resetStates = async () => {
	modelRunLocked.set(false);

	latest.set(undefined);
	inProgress.set(undefined);
	modelRun.set(undefined);
	await getInitialMetaData();
	metaJson.set(await getMetaData());

	preferences.set(defaultPreferences);
	vectorOptions.set(defaultVectorOptions);

	sheet.set(false);
	loading.set(false);

	time.set(new Date(now));

	domain.set('dwd_icon');
	variable.set('temperature_2m');

	domainSelectionOpen.set(false);
	variableSelectionOpen.set(false);
	variableSelectionExtended.set(undefined);

	tileSize.set(256);
	resolution.set(1);
	resolutionSet.set(false);

	opacity.set(75);

	customColorScales.set({});

	helpOpen.set(false);

	setMode('system');
};

// used to check against url search parameters
export const completeDefaultValues: { [key: string]: boolean | string | number } = {
	domain: defaultDomain,
	variable: defaultVariable,

	...defaultPreferences,
	...defaultVectorOptions
};
