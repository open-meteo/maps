import { get } from 'svelte/store';

import L from 'leaflet';

import { type SelectedLocation, selectedLocation } from '#lib/stores/location.js';
import { map as m } from '#lib/stores/map.js';

import { ZOOM_OFFSET } from './map-controls';
import { syncLocationToUrl } from './url';

/** Zoom (MapLibre scale) the map flies to for a location: the place within its region, which suits the raster resolution */
export const LOCATION_ZOOM = 8.5;

// Leaflet has no geolocate dot of its own: the marker borrows MapLibre's
// user-location dot class (its stylesheet is loaded for the basemap plugin),
// so a searched place looks like it does in the MapLibre app.
let marker: L.Marker | undefined;

const placeMarker = (map: L.Map, { latitude, longitude }: SelectedLocation): void => {
	if (!marker) {
		marker = L.marker([latitude, longitude], {
			icon: L.divIcon({ className: 'maplibregl-user-location-dot', iconSize: [15, 15] }),
			interactive: false
		});
	}
	marker.setLatLng([latitude, longitude]).addTo(map);
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
	map.flyTo([location.latitude, location.longitude], LOCATION_ZOOM + ZOOM_OFFSET);
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
