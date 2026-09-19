import { type Writable, get, writable } from 'svelte/store';

import { renderPopup } from '$lib/popup';

import type L from 'leaflet';

export const map: Writable<L.Map> = writable();

export const popup: Writable<L.Marker | undefined> = writable(undefined);
export const popupMode: Writable<null | 'follow' | 'drag'> = writable(null);

popupMode.subscribe((pM) => {
	const p = get(popup);
	let lastLatLng;
	if (p) {
		lastLatLng = p.getLatLng();
	}
	p?.remove();
	popup.set(undefined);
	if (pM) {
		renderPopup(lastLatLng ?? get(map).getCenter());
	}
});
