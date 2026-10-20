import { type Writable, derived, get, writable } from 'svelte/store';

import {
	LEVEL_PREFIX,
	LEVEL_REGEX,
	LEVEL_UNIT_REGEX,
	domainOptions,
	variableAvailable,
	variableOptions
} from '@openmeteo/weather-map-layer';
import { type Persisted, persisted } from 'svelte-persisted-store';

import { browser } from '$app/env';

import { DEFAULT_DOMAIN, DEFAULT_VARIABLE } from '#lib/constants.js';

import { metaJson } from './time';

export const defaultDomain = DEFAULT_DOMAIN;
export const domain = persisted('domain', defaultDomain);

export const defaultVariable = DEFAULT_VARIABLE;
export const variable = persisted('variable', defaultVariable);

/**
 * Variables the active domain can show, in the shape of `metaJson.variables`:
 * the ones its files store, plus the ones the layer's derivation rules read
 * from those (snowfall from its water equivalent, the humidity-derived
 * fields, precipitation rates), which the metadata never lists. The label
 * dictionary is the candidate list, since the rules match by pattern.
 * Undefined until the metadata has loaded.
 */
export const availableVariables = derived(metaJson, ($metaJson) => {
	if (!$metaJson) return undefined;
	const stored = new Set($metaJson.variables);
	const derivable = variableOptions
		.map(({ value }) => value)
		.filter((value) => !stored.has(value) && variableAvailable(value, stored));
	return [...$metaJson.variables, ...derivable];
});

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
		return {
			value: $variable,
			label: $variable
		};
	}
});

export const levelGroupSelected: Writable<{ value: string; label: string } | undefined> = writable(
	get(selectedVariable).value.match(LEVEL_REGEX)
		? (variableOptions.find(
				({ value }) => value === get(selectedVariable).value.match(LEVEL_PREFIX)?.groups?.prefix
			) ?? undefined)
		: undefined
);

selectedVariable.subscribe((newVariable) => {
	levelGroupSelected.set(
		newVariable.value.match(LEVEL_REGEX)
			? (variableOptions.find(
					({ value }) => value === newVariable.value.match(LEVEL_PREFIX)?.groups?.prefix
				) ?? undefined)
			: undefined
	);
});

export const level = derived(selectedVariable, (sV) => {
	const match = sV.value.match(LEVEL_UNIT_REGEX);
	if (match && match.groups) {
		return match.groups.level;
	} else {
		return undefined;
	}
});

export const unit = derived(selectedVariable, (sV) => {
	const match = sV.value.match(LEVEL_UNIT_REGEX);
	if (match && match.groups) {
		return match.groups.unit;
	} else {
		return undefined;
	}
});

export const domainSelectionOpen = writable(false);
export const variableSelectionOpen = writable(false);
export const pressureLevelsSelectionOpen = writable(false);
// Storing undefined corrupts the entry (localStorage coerces it to the string
// "undefined", which is not valid JSON) — remove entries written by older versions.
if (browser && localStorage.getItem('variables_open') === 'undefined') {
	localStorage.removeItem('variables_open');
}

export const variableSelectionExtended: Persisted<boolean | null> = persisted(
	'variables_open',
	null
); // null (never persist undefined) so it can be set to true on desktop on first load
