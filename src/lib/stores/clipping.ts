import { type Writable, writable } from 'svelte/store';

export const clippingCountryCodes: Writable<string[]> = writable([]);
export const clippingPanelOpen = writable(false);
/** True while terra-draw is in a drawing/select mode — suppresses the map popup. */
export const terraDrawActive = writable(false);
/** Unix ms timestamp until which map clicks must not toggle popup (prevents final draw click race). */
export const suppressPopupUntil = writable(0);
