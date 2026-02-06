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

export const vectorOptions = persisted('vector-options', defaultVectorOptions);
