import { simplify, union } from '@turf/turf';

import type { Country } from '$lib/components/clipping/country-data';
import type {
	ClippingOptions,
	GeoJson,
	GeoJsonGeometry,
	GeoJsonPosition
} from '@openmeteo/mapbox-layer';
import type { FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson';

/** Ensure every polygon ring is properly closed (first coord === last coord). */
const closeRings = (features: FeatureCollection<Geometry>): void => {
	for (const feature of features.features) {
		const geom = feature.geometry;
		const rings =
			geom.type === 'Polygon'
				? (geom.coordinates as number[][][])
				: geom.type === 'MultiPolygon'
					? (geom.coordinates as number[][][][]).flat()
					: [];
		for (const ring of rings) {
			if (ring.length < 2) continue;
			const first = ring[0];
			const last = ring[ring.length - 1];
			if (first[0] !== last[0] || first[1] !== last[1]) {
				ring.push([...first]);
			}
		}
	}
};

const countGeometryPoints = (geometry: Geometry | null): number => {
	if (!geometry) return 0;
	if (geometry.type === 'Polygon') {
		return (geometry.coordinates as number[][][]).reduce((sum, ring) => sum + ring.length, 0);
	}
	if (geometry.type === 'MultiPolygon') {
		return (geometry.coordinates as number[][][][]).reduce(
			(sum, polygon) => sum + polygon.reduce((ringSum, ring) => ringSum + ring.length, 0),
			0
		);
	}
	if (geometry.type === 'GeometryCollection') {
		return geometry.geometries.reduce((sum, geom) => sum + countGeometryPoints(geom), 0);
	}
	return 0;
};

const computeSimplifyTolerance = (pointCount: number): number => {
	const minTolerance = 0.0005;
	const maxTolerance = 0.01;
	if (pointCount <= 1000) return minTolerance;
	if (pointCount >= 10000) return maxTolerance;
	const t = (pointCount - 1000) / 9000;
	return minTolerance + (maxTolerance - minTolerance) * t;
};

export const buildCountryClippingOptions = (countries: Country[]): ClippingOptions | undefined => {
	if (countries.length === 0) return undefined;

	const allFeatures = countries.flatMap((country) => {
		if (!country.geojson) return [];
		const fc = country.geojson as FeatureCollection<Geometry>;
		return fc.features ?? [];
	});

	const mergedGeojson: FeatureCollection<Geometry> = {
		type: 'FeatureCollection',
		features: allFeatures
	};

	const totalPoints = mergedGeojson.features.reduce(
		(sum, feature) => sum + countGeometryPoints(feature.geometry),
		0
	);
	const simplifyTolerance = computeSimplifyTolerance(totalPoints);

	// Some country GeoJSON files have unclosed rings — fix before union/simplify
	closeRings(mergedGeojson);

	// Union all polygons into a single geometry to merge overlapping/adjacent countries
	let toSimplify: FeatureCollection<Geometry>;
	if (allFeatures.length >= 2) {
		const unioned = union(mergedGeojson as FeatureCollection<Polygon | MultiPolygon>);
		if (!unioned) return undefined;
		toSimplify = { type: 'FeatureCollection', features: [unioned] };
	} else {
		toSimplify = mergedGeojson;
	}

	const result = simplify(toSimplify, {
		tolerance: simplifyTolerance,
		highQuality: true
	});

	// simplify can produce unclosed rings — fix after
	closeRings(result);

	return { geojson: result };
};

type PolygonCoordinates = GeoJsonPosition[][];
type MultiPolygonCoordinates = GeoJsonPosition[][][];
type ClippingPolygonGeometry = Extract<GeoJsonGeometry, { type: 'Polygon' | 'MultiPolygon' }>;

export const toClippingGeometry = (
	geojson: GeoJson | undefined
): ClippingPolygonGeometry | null => {
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
		return { type: 'Polygon', coordinates: polygons[0] };
	}

	return { type: 'MultiPolygon', coordinates: polygons };
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
