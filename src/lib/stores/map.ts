import { type Writable, get, writable } from 'svelte/store';

import { renderPopup } from '$lib/popup';

import type Map from 'ol/Map';
import type Overlay from 'ol/Overlay';

export const map: Writable<Map> = writable();

export const popup: Writable<Overlay | undefined> = writable(undefined);
export const popupMode: Writable<null | 'follow' | 'drag'> = writable(null);

popupMode.subscribe((pM) => {
	const p = get(popup);
	let lastPosition;
	if (p) {
		lastPosition = p.getPosition();
	}
	p?.setMap(null);
	popup.set(undefined);
	if (pM) {
		const position = lastPosition ?? get(map).getView().getCenter();
		if (position) renderPopup(position);
	}
});
