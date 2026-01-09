import { type Writable, writable } from 'svelte/store';

export const map: Writable<maplibregl.Map> = writable();
