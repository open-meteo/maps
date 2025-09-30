import { writable, type Writable } from 'svelte/store';

import { persisted } from 'svelte-persisted-store';

import { domainOptions } from '$lib/utils/domains';
import { variableOptions } from '$lib/utils/variables';

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
export const drawer = writable(false);
export const drawerHeight = writable(0.4);

export const loading = writable(false);
export const mapBounds: Writable<maplibregl.LngLatBounds | null> = writable(null);
