/**
 * Native ICON grids loading right now: their cell index is a separate file
 * of up to 65 MB, downloaded and then triangulated (seconds for the global
 * grid) before the first frame, so the page shows that progress instead of
 * the spinner.
 */
import { readable } from 'svelte/store';

import { type GridLoadProgress, onGridLoadProgress } from '@openmeteo/weather-map-layer';

/** The grids still downloading or triangulating, oldest first. */
export const gridLoading = readable<GridLoadProgress[]>([], (set) => {
	const loads = new Map<string, GridLoadProgress>();
	return onGridLoadProgress((progress) => {
		if (progress.phase === 'ready' || progress.phase === 'error') loads.delete(progress.url);
		else loads.set(progress.url, progress);
		set([...loads.values()]);
	});
});
