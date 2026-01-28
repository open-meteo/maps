import { MediaQuery } from 'svelte/reactivity';
import { type Writable, writable } from 'svelte/store';

import { setMode } from 'mode-watcher';
import { type Persisted, persisted } from 'svelte-persisted-store';

import { getInitialMetaData, getMetaData } from '$lib';
import {
	COMPLETE_DEFAULT_VALUES,
	DEFAULT_OPACITY,
	DEFAULT_PREFERENCES,
	DEFAULT_RESOLUTION,
	DEFAULT_TILE_SIZE
} from '$lib/constants';

import { customColorScales } from './om-protocol-settings';
import {
	domain,
	domainSelectionOpen,
	variable,
	variableSelectionExtended,
	variableSelectionOpen
} from './variables';
import { defaultVectorOptions, vectorOptions } from './vector';

import type { DomainMetaDataJson } from '@openmeteo/mapbox-layer';

export const defaultPreferences = DEFAULT_PREFERENCES;

export const preferences = persisted('preferences', defaultPreferences);

// URL object containing current url states setings and flags
export const url: Writable<URL> = writable();

let now = new Date();
now.setUTCHours(now.getUTCHours() + 1, 0, 0, 0);

export const time = writable(new Date(now));
export const modelRun: Writable<Date | undefined> = writable(undefined);

export const sheet = writable(false);
export const loading = writable(true);

export const tileSize: Persisted<128 | 256 | 512> = persisted('tile_size', DEFAULT_TILE_SIZE);
export const resolution: Persisted<0.5 | 1 | 2> = persisted('resolution', DEFAULT_RESOLUTION);
// check for retina / hd on first load, afterwards the resolution won't be set
export const resolutionSet = persisted('resolution-set', false);

export const opacity = persisted('opacity', DEFAULT_OPACITY);

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

	now = new Date();
	now.setUTCHours(now.getUTCHours() + 1, 0, 0, 0);
	time.set(new Date(now));

	domain.set('dwd_icon');
	variable.set('temperature_2m');

	domainSelectionOpen.set(false);
	variableSelectionOpen.set(false);
	variableSelectionExtended.set(undefined);

	tileSize.set(DEFAULT_TILE_SIZE);
	resolution.set(DEFAULT_RESOLUTION);
	resolutionSet.set(false);

	opacity.set(DEFAULT_OPACITY);

	customColorScales.set({});

	helpOpen.set(false);

	setMode('system');
};

// used to check against url search parameters
export const completeDefaultValues = COMPLETE_DEFAULT_VALUES;

export const desktop = new MediaQuery('min-width: 768px');
