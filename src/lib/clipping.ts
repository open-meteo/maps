import { flatten, simplify } from '@turf/turf';

import type { Country } from '$lib/components/selection/country-selector.svelte';
import type {
	ClippingOptions,
	GeoJson,
	GeoJsonGeometry,
	GeoJsonPosition
} from '@openmeteo/mapbox-layer';
import type { FeatureCollection, Geometry } from 'geojson';

export const buildCountryClippingOptions = (countries: Country[]): ClippingOptions | undefined => {
	if (countries.length === 0) return undefined;

	const allFeatures = countries.flatMap((country) => {
		if (!country.geojson) return [];
		const flattened = flatten(country.geojson) as FeatureCollection<Geometry>;
		return flattened.features;
	});

	const mergedGeojson: FeatureCollection<Geometry> = {
		type: 'FeatureCollection',
		features: allFeatures
	};

	const simplifiedGeoJSON = simplify(mergedGeojson, {
		tolerance: 0.00025,
		highQuality: true
	});

	return { geojson: simplifiedGeoJSON };
};

type PolygonCoordinates = GeoJsonPosition[][];
type MultiPolygonCoordinates = GeoJsonPosition[][][];

export const toClippingGeometry = (geojson: GeoJson | undefined): GeoJsonGeometry | null => {
	if (!geojson) return null;

	const polygons: MultiPolygonCoordinates = [];

	const addGeometry = (geometry: GeoJsonGeometry | null) => {
		if (!geometry) return;
		if (geometry.type === 'Polygon') {
			polygons.push(geometry.coordinates as PolygonCoordinates);
			return;
		}
		if (geometry.type === 'MultiPolygon') {
			polygons.push(...(geometry.coordinates as MultiPolygonCoordinates));
			return;
		}
		if (geometry.type === 'GeometryCollection') {
			for (const child of geometry.geometries) {
				addGeometry(child);
			}
		}
	};

	if (geojson.type === 'FeatureCollection') {
		for (const feature of geojson.features) {
			addGeometry(feature.geometry);
		}
	} else if (geojson.type === 'Feature') {
		addGeometry(geojson.geometry);
	} else {
		addGeometry(geojson);
	}

	if (polygons.length === 0) return null;
	if (polygons.length === 1) {
		return { type: 'Polygon', coordinates: polygons[0] } as GeoJsonGeometry;
	}

	return { type: 'MultiPolygon', coordinates: polygons } as GeoJsonGeometry;
};

export const CLIP_COUNTRIES_PARAM = 'clip_countries';

export const isSameCountrySelection = (a: string[], b: string[]) =>
	a.length === b.length && a.every((value, index) => value === b[index]);

export const parseClipCountriesParam = (value: string | null): string[] => {
	if (!value) return [];
	return value
		.split(',')
		.map((code) => code.trim())
		.filter((code) => code.length > 0);
};

export const serializeClipCountriesParam = (codes: string[]): string | undefined => {
	const uniqueCodes = Array.from(new Set(codes.map((code) => code.trim()))).filter(Boolean);
	return uniqueCodes.length > 0 ? uniqueCodes.join(',') : undefined;
};
