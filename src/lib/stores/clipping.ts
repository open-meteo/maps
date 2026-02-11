import { type Writable, writable } from 'svelte/store';

export const clippingCountryCodes: Writable<string[]> = writable([]);
