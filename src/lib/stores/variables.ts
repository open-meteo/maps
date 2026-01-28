import { type Writable, derived, get, writable } from 'svelte/store';

import {
	LEVEL_PREFIX,
	LEVEL_REGEX,
	LEVEL_UNIT_REGEX,
	domainOptions,
	variableOptions
} from '@openmeteo/mapbox-layer';
import { type Persisted, persisted } from 'svelte-persisted-store';

import { DEFAULT_DOMAIN, DEFAULT_VARIABLE } from '$lib/constants';

export const defaultDomain = DEFAULT_DOMAIN;
export const domain = persisted('domain', defaultDomain);

export const defaultVariable = DEFAULT_VARIABLE;
export const variable = persisted('variable', defaultVariable);

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
export const variableSelectionExtended: Persisted<boolean | undefined> = persisted(
	'variables_open',
	undefined
); // undefined so it can be set to true on desktop on first load
