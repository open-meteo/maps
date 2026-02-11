import * as turf from '@turf/turf';

import type { Country } from '$lib/components/selection/country-selector.svelte';
import type { ClippingOptions } from '@openmeteo/mapbox-layer';
import type { FeatureCollection, Geometry } from 'geojson';

export const buildCountryClippingOptions = (countries: Country[]): ClippingOptions | undefined => {
	if (countries.length === 0) return undefined;

	const allFeatures = countries.flatMap((country) => {
		if (!country.geojson) return [];
		const flatten = turf.flatten(country.geojson) as FeatureCollection<Geometry>;
		return flatten.features;
	});

	const mergedGeojson: FeatureCollection<Geometry> = {
		type: 'FeatureCollection',
		features: allFeatures
	};

	const simplifiedGeoJSON = turf.simplify(mergedGeojson, {
		tolerance: 0.00025,
		highQuality: true
	});

	return { geojson: simplifiedGeoJSON };
};
