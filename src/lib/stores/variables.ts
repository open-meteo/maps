import { derived, writable } from 'svelte/store';

import { domainOptions, variableOptions } from '@openmeteo/mapbox-layer';
import { persisted } from 'svelte-persisted-store';

export const defaultDomain = 'dwd_icon';
export const domain = persisted('domain', defaultDomain);

export const defaultVariable = 'temperature_2m';
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
		// Throwing an error here is not the preferred thing to do!
		// Instead we use the selected variable as a label as well.
		return {
			value: $variable,
			label: $variable
		};
	}
});

export const domainSelectionOpen = writable(false);
export const variableSelectionOpen = writable(false);
export const pressureLevelsSelectionOpen = writable(false);
export const variableSelectionExtended = persisted('variables_open', false);
