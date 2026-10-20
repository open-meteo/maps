import { get } from 'svelte/store';

import Overlay from 'ol/Overlay';
import { fromLonLat } from 'ol/proj';

import { type SelectedLocation, selectedLocation } from '#lib/stores/location.js';
import { map as m } from '#lib/stores/map.js';

import { ZOOM_OFFSET } from './map-controls';
import { syncLocationToUrl } from './url';

import type Map from 'ol/Map';

/** Zoom (MapLibre scale) the map flies to for a location: the place within its region, which suits the raster resolution */
export const LOCATION_ZOOM = 8.5;

// OpenLayers has no geolocate dot: an overlay carrying a dot styled like
// MapLibre's marks the place, so it looks like it does in the MapLibre app.
let marker: Overlay | undefined;

const placeMarker = (map: Map, { latitude, longitude }: SelectedLocation): void => {
	if (!marker) {
		const dot = document.createElement('div');
		dot.style.cssText =
			'width:15px;height:15px;border-radius:50%;background:#1da1f2;border:2px solid #fff;box-shadow:0 0 2px rgba(0,0,0,0.35)';
		marker = new Overlay({ element: dot, positioning: 'center-center', stopEvent: false });
	}
	marker.setPosition(fromLonLat([longitude, latitude]));
	if (!map.getOverlays().getArray().includes(marker)) map.addOverlay(marker);
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
	map.getView().animate({
		center: fromLonLat([location.longitude, location.latitude]),
		zoom: LOCATION_ZOOM + ZOOM_OFFSET
	});
};

export const clearLocation = (): void => {
	selectedLocation.set(undefined);
	syncLocationToUrl(undefined);
	const map = get(m);
	if (map && marker) map.removeOverlay(marker);
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
