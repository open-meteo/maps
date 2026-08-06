import { persisted } from 'svelte-persisted-store';

import { DEFAULT_VECTOR_OPTIONS } from '$lib/constants';

export const defaultVectorOptions = DEFAULT_VECTOR_OPTIONS;

export interface VectorOptions {
	grid: boolean;
	arrows: boolean;
	contours: boolean;
	breakpoints: boolean;
	contourInterval: number;
}

/**
 * `beforeRead` fills in keys the stored object predates: a `vector-options`
 * written before a key existed (e.g. `arrows`) otherwise reads back as
 * `undefined` and silently disables the feature for anyone whose localStorage
 * survived the change.
 */
export const vectorOptions = persisted<VectorOptions, Partial<VectorOptions>>(
	'vector-options',
	defaultVectorOptions,
	{ beforeRead: (stored) => ({ ...defaultVectorOptions, ...stored }) }
);
