import { type Writable, writable } from 'svelte/store';

import { persisted } from 'svelte-persisted-store';

import type { DomainMetaDataJson } from '@openmeteo/weather-map-layer';

/**
 * Domain shown right of the divider in compare mode; null is compare mode
 * off. Persisted like the domain itself and mirrored to the `compare` URL
 * param. Null rather than undefined: localStorage stores undefined as the
 * string "undefined", which does not parse back (see variables.ts).
 */
export const compareDomain = persisted<string | null>('compare_domain', null);

/** Position of the divider as a fraction of the map width. */
export const compareSplit = writable(0.5);

/** Metadata of the compared domain's latest run; undefined until loaded. */
export const compareMeta: Writable<DomainMetaDataJson | undefined> = writable(undefined);

/**
 * Valid time the compare map shows: the compared run's step nearest to the
 * selected time, which only equals it when both models share the interval.
 */
export const compareTime: Writable<Date | undefined> = writable(undefined);

export const compareLoading = writable(false);
