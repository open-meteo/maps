import { type Writable, get, writable } from 'svelte/store';

import { type Persisted, persisted } from 'svelte-persisted-store';

import { renderPopup } from '$lib/popup';

export const map: Writable<maplibregl.Map> = writable();

export const popup: Writable<maplibregl.Marker | undefined> = writable();
export const showPopup: Writable<boolean> = writable(false);
export const popupFollowMouse: Persisted<boolean> = persisted('popup-follow-mouse', false);

popupFollowMouse.subscribe(() => {
	const p = get(popup);
	let lastLngLat;
	if (p) {
		lastLngLat = p.getLngLat();
	}
	p?.remove();
	popup.set(undefined);
	if (showPopup && lastLngLat) {
		renderPopup(lastLngLat);
	}
});
