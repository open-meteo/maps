import { persisted } from 'svelte-persisted-store';

export const preferences = persisted('preferences', {
	// buttons
	partial: false,
	hillshade: false,
	showScale: true,
	showTimeSelector: true,

	// dom
	sheetOpen: false,
	drawerOpen: false
});
