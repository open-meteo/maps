import { MediaQuery } from 'svelte/reactivity';
import { type Writable, writable } from 'svelte/store';

import { setMode } from 'mode-watcher';
import { type Persisted, persisted } from 'svelte-persisted-store';

import {
	COMPLETE_DEFAULT_VALUES,
	DEFAULT_OPACITY,
	DEFAULT_PREFERENCES,
	DEFAULT_TILE_SIZE
} from '$lib/constants';
import { getInitialMetaData, getMetaData } from '$lib/metadata';

import { customColorScales } from './om-protocol-settings';
import { inProgress, latest, metaJson, modelRun, modelRunLocked, now, time } from './time';
import {
	domain,
	domainSelectionOpen,
	variable,
	variableSelectionExtended,
	variableSelectionOpen
} from './variables';
import { defaultVectorOptions, vectorOptions } from './vector';

export const defaultPreferences = DEFAULT_PREFERENCES;

export interface Preferences {
	globe: boolean;
	terrain: boolean;
	hillshade: boolean;
	clipWater: boolean;
	showScale: boolean;
	timeSelector: boolean;
}

export const preferences = persisted('preferences', defaultPreferences);

// URL object containing current url states setings and flags
export const url: Writable<URL> = writable();

export const sheet = writable(false);
export const loading = writable(true);

export const tileSize: Persisted<64 | 128 | 256 | 512 | 1024 | 2048> = persisted(
	'tile_size',
	DEFAULT_TILE_SIZE
);

// check for retina / hd on first load, afterwards the tile-size won't be set
export const tileSizeSet = persisted('tile-size-set', false);

export const opacity = persisted('opacity', DEFAULT_OPACITY);

export const localStorageVersion: Persisted<string | undefined> = persisted(
	'local-storage-version',
	undefined
);

export const helpOpen = writable(false);

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

	const currentTimeStep = new Date();
	currentTimeStep.setUTCHours(currentTimeStep.getUTCHours() + 1, 0, 0, 0);
	now.set(new Date());
	time.set(new Date(currentTimeStep));

	domain.set('dwd_icon');
	variable.set('temperature_2m');

	domainSelectionOpen.set(false);
	variableSelectionOpen.set(false);
	variableSelectionExtended.set(undefined);

	tileSize.set(DEFAULT_TILE_SIZE);
	tileSizeSet.set(false);

	opacity.set(DEFAULT_OPACITY);

	customColorScales.set({});

	helpOpen.set(false);

	setMode('system');
};

// used to check against url search parameters
export const completeDefaultValues = COMPLETE_DEFAULT_VALUES;

export const desktop = new MediaQuery('min-width: 768px');
