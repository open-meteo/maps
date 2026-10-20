import { get } from 'svelte/store';

import * as maplibregl from 'maplibre-gl';

import { type SelectedLocation, selectedLocation } from '#lib/stores/location.js';
import { map as m } from '#lib/stores/map.js';

import { syncLocationToUrl } from './url';

/** Zoom the map opens at and flies to for a location: the place within its region, which suits the raster resolution */
export const LOCATION_ZOOM = 8.5;

// The geolocate control's dot, pulsing ring included: a searched place looks
// like the located one, the two only differ in what put them on the map.
let marker: maplibregl.Marker | undefined;

const placeMarker = (map: maplibregl.Map, { latitude, longitude }: SelectedLocation): void => {
	if (!marker) {
		const dot = document.createElement('div');
		dot.className = 'maplibregl-user-location-dot';
		marker = new maplibregl.Marker({ element: dot });
	}
	marker.setLngLat([longitude, latitude]).addTo(map);
};

/**
 * Select `location`: stored, mirrored into the URL, marked on the map, and the
 * camera flies there.
 */
export const setLocation = (location: SelectedLocation): void => {
	selectedLocation.set(location);
	syncLocationToUrl(location);

	const map = get(m);
	if (!map) return;
	placeMarker(map, location);
	map.flyTo({ center: [location.longitude, location.latitude], zoom: LOCATION_ZOOM });
};

export const clearLocation = (): void => {
	selectedLocation.set(undefined);
	syncLocationToUrl(undefined);
	marker?.remove();
};

/**
 * Marks the location the URL named once the map exists. No flight: the map
 * starts on it (see createMap), or on the position hash when there is one.
 */
export const addLocationMarker = (): void => {
	const map = get(m);
	const location = get(selectedLocation);
	if (map && location) placeMarker(map, location);
};
