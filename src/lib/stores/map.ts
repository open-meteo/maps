import { type Writable, writable } from 'svelte/store';

export const map: Writable<maplibregl.Map> = writable();

export const mapBounds: Writable<maplibregl.LngLatBounds | null> = writable(null);
export const paddedBounds: Writable<maplibregl.LngLatBounds | null> = writable(null);
export const paddedBoundsLayer: Writable<maplibregl.StyleLayer | undefined> = writable(undefined);
export const paddedBoundsSource: Writable<maplibregl.GeoJSONSource | undefined> =
	writable(undefined);
export const paddedBoundsGeoJSON: Writable<GeoJSON.GeoJSON | null> = writable(null);
