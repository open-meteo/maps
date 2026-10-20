import { type Writable, writable } from 'svelte/store';

import { persisted } from 'svelte-persisted-store';

/**
 * A place the map is focused on: picked in the location search, parsed from
 * the `lat`/`lon` URL params or sent by an embedder.
 */
export interface SelectedLocation {
	latitude: number;
	longitude: number;
	/** Only places picked in the search carry a name; the URL and embedders send coordinates only */
	name?: string;
}

export const selectedLocation: Writable<SelectedLocation | undefined> = writable(undefined);

export const locationSearchOpen = writable(false);

/** A geocoding result as the search lists it and the favourite and recent lists keep it */
export interface GeoLocation {
	id: number;
	name: string;
	latitude: number;
	longitude: number;
	elevation?: number;
	admin1?: string;
	country?: string;
	country_code?: string;
}

// User data like the saved charts: both survive a state reset
export const storedRecentLocations = persisted<GeoLocation[]>('recent_locations', []);
export const storedFavoriteLocations = persisted<GeoLocation[]>('favorite_locations', []);

const MAX_RECENT_LOCATIONS = 8;
const MAX_FAVORITE_LOCATIONS = 24;

/** Front of the recent list, replacing an older entry of the same place */
export const addRecentLocation = (location: GeoLocation): void => {
	storedRecentLocations.update((list) =>
		[location, ...list.filter(({ id }) => id !== location.id)].slice(0, MAX_RECENT_LOCATIONS)
	);
};

export const removeRecentLocation = (location: GeoLocation): void => {
	storedRecentLocations.update((list) => list.filter(({ id }) => id !== location.id));
};

export const toggleFavoriteLocation = (location: GeoLocation): void => {
	storedFavoriteLocations.update((list) =>
		list.some(({ id }) => id === location.id)
			? list.filter(({ id }) => id !== location.id)
			: [location, ...list].slice(0, MAX_FAVORITE_LOCATIONS)
	);
};

const toCoordinate = (value: unknown, limit: number): number | undefined => {
	// Number() alone would accept null, '' and booleans as 0 or 1
	const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
	if (typeof number !== 'number' || !Number.isFinite(number) || Math.abs(number) > limit) {
		return undefined;
	}
	return number;
};

/**
 * Coordinates as they arrive from URL params or an embedder message: strings
 * or numbers, each checked against its range. Undefined unless both are valid.
 */
export const parseCoordinates = (lat: unknown, lon: unknown): SelectedLocation | undefined => {
	const latitude = toCoordinate(lat, 90);
	const longitude = toCoordinate(lon, 180);
	if (latitude === undefined || longitude === undefined) return undefined;
	return { latitude, longitude };
};

/** `52.52°N 13.41°E`: the label of a location without a name */
export const formatCoordinates = ({
	latitude,
	longitude
}: Pick<SelectedLocation, 'latitude' | 'longitude'>): string =>
	`${Math.abs(latitude).toFixed(2)}°${latitude < 0 ? 'S' : 'N'} ${Math.abs(longitude).toFixed(2)}°${longitude < 0 ? 'W' : 'E'}`;
