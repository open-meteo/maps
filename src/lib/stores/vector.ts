import { persisted } from 'svelte-persisted-store';

export const defaultVectorOptions = {
	grid: false,
	arrows: true,
	contours: false,
	breakpoints: true,
	contourInterval: 2
};

export const vectorOptions = persisted('vector-options', defaultVectorOptions);
