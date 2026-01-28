import { persisted } from 'svelte-persisted-store';

import { DEFAULT_VECTOR_OPTIONS } from '$lib/constants';

export const defaultVectorOptions = DEFAULT_VECTOR_OPTIONS;

export const vectorOptions = persisted('vector-options', defaultVectorOptions);
