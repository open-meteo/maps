import { type Writable, get, writable } from 'svelte/store';

import { renderPopup } from '$lib/popup';

import type * as maplibregl from 'maplibre-gl';

export const map: Writable<maplibregl.Map> = writable();

export const popup: Writable<maplibregl.Marker | undefined> = writable(undefined);
export const popupMode: Writable<null | 'follow' | 'drag'> = writable(null);

popupMode.subscribe((pM) => {
	const p = get(popup);
	let lastLngLat;
	if (p) {
		lastLngLat = p.getLngLat();
	}
	p?.remove();
	popup.set(undefined);
	if (pM) {
		renderPopup(lastLngLat ?? get(map).getCenter());
	}
});
