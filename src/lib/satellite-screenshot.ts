import { mode } from 'mode-watcher';

import { BEFORE_LAYER_VECTOR } from '$lib/constants';

import type * as maplibregl from 'maplibre-gl';

/**
 * Satellite-coverage screenshot view (`?screenshot=satellites`).
 *
 * A companion to the per-domain screenshots (see `screenshot.ts` /
 * `scripts/domain-screenshots.mjs`): instead of framing a gridded weather model, this
 * renders the geostationary satellites feeding the Satellite Radiation API as coloured
 * sub-satellite dots with dotted coverage disks over the standard base map, so the
 * website's satellite figure can be regenerated in the same light/dark style as every
 * other model-area image.
 */

interface Satellite {
	label: string;
	/** Sub-satellite longitude in °E (negative = °W). */
	longitude: number;
	color: string;
}

// Geostationary satellites used by Open-Meteo's satellite-radiation sources. GOES-East /
// GOES-West are NASA feeds that aren't integrated yet but are shown for completeness, so
// this mirrors the "Satellite Data Sources" table in the docs.
const SATELLITES: Satellite[] = [
	{ label: 'GOES-West', longitude: -137.2, color: '#f97316' },
	{ label: 'GOES-East', longitude: -75.2, color: '#eab308' },
	{ label: 'MSG / MTG', longitude: 0, color: '#9ca3af' },
	// IODC = the operational Indian Ocean Meteosat (Meteosat-9 at 45.5°E since 2022;
	// the earlier Meteosat-8 IODC at 41.5°E was decommissioned).
	{ label: 'IODC', longitude: 45.5, color: '#c084fc' },
	{ label: 'Himawari-9', longitude: 140.7, color: '#38bdf8' }
];

// Angular radius (great-circle degrees) of each drawn coverage disk. The true visible
// limb of a geostationary satellite is ~81°; a slightly smaller usable-coverage radius
// keeps the overlapping circles readable and roughly matches the reference graphic.
const COVERAGE_RADIUS_DEG = 72;

const SAT_CIRCLE_SOURCE = 'satelliteCircleSource';
const SAT_POINT_SOURCE = 'satellitePointSource';
const SAT_CIRCLE_LAYER = 'satelliteCircleLayer';
const SAT_DOT_LAYER = 'satelliteDotLayer';
const SAT_LABEL_LAYER = 'satelliteLabelLayer';

/** Whether the app is in the satellite-coverage screenshot view (`?screenshot=satellites`). */
export const isSatelliteScreenshot = (): boolean => {
	if (typeof window === 'undefined') return false;
	return new URLSearchParams(window.location.search).get('screenshot') === 'satellites';
};

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

const formatLon = (lon: number): string => {
	if (lon === 0) return '0°';
	return `${Math.abs(lon)}°${lon > 0 ? 'E' : 'W'}`;
};

/**
 * Geodesic circle of angular radius `radiusDeg` around a point on the equator. Returned
 * as an open→closed ring of [lng, lat] pairs; longitudes are left unwrapped (they can run
 * past ±180 for the Pacific satellites) so MapLibre's world-copy wrapping renders them
 * seamlessly across the antimeridian.
 */
const coverageRing = (lonCenter: number, radiusDeg: number, steps = 180): [number, number][] => {
	const d = toRad(radiusDeg);
	const ring: [number, number][] = [];
	for (let i = 0; i <= steps; i++) {
		const bearing = toRad((i / steps) * 360);
		const lat = Math.asin(Math.sin(d) * Math.cos(bearing));
		const lon = toRad(lonCenter) + Math.atan2(Math.sin(bearing) * Math.sin(d), Math.cos(d));
		ring.push([toDeg(lon), toDeg(lat)]);
	}
	return ring;
};

// How far to zoom out from the exact one-world-fills-the-width fit, giving a margin of
// empty ocean around the disks. Kept small on purpose: the reveal of the neighbouring
// world copy stays under ~28° of longitude per side, so the disks still wrap in cleanly
// from the opposite edge but the nearest dots/labels (Himawari 140.7°E, GOES-West
// 137.2°W, both ~38°+ from the seam) never get duplicated into the margin.
const ZOOM_OUT = 0.2;

/**
 * Frame the whole world so every satellite's coverage fits, centred on the Greenwich
 * meridian (the map's seam then falls in the mid-Pacific, between Himawari and GOES-West).
 */
export const fitSatelliteView = (map: maplibregl.Map): void => {
	const width = map.getContainer().clientWidth || 1240;
	map.jumpTo({ center: [5, 0], zoom: Math.log2(width / 512) - ZOOM_OUT });
};

/** Draw the geostationary satellites (dots + labels + dotted coverage disks). */
export const drawSatelliteCoverage = (map: maplibregl.Map): void => {
	const dark = mode.current === 'dark';

	map.addSource(SAT_CIRCLE_SOURCE, {
		type: 'geojson',
		data: {
			type: 'FeatureCollection',
			features: SATELLITES.map((s) => ({
				type: 'Feature',
				properties: { color: s.color },
				// LineString rather than Polygon: a filled ring's implicit closing segment can
				// jump ~360° for the disks that cross the antimeridian.
				geometry: {
					type: 'LineString',
					coordinates: coverageRing(s.longitude, COVERAGE_RADIUS_DEG)
				}
			}))
		}
	});

	map.addSource(SAT_POINT_SOURCE, {
		type: 'geojson',
		data: {
			type: 'FeatureCollection',
			features: SATELLITES.map((s) => ({
				type: 'Feature',
				properties: { color: s.color, label: `${s.label}\n${formatLon(s.longitude)}` },
				geometry: { type: 'Point', coordinates: [s.longitude, 0] }
			}))
		}
	});

	// Keep the dotted coverage lines under the base map's place labels for legibility.
	const before = map.getLayer(BEFORE_LAYER_VECTOR) ? BEFORE_LAYER_VECTOR : undefined;

	map.addLayer(
		{
			id: SAT_CIRCLE_LAYER,
			type: 'line',
			source: SAT_CIRCLE_SOURCE,
			layout: { 'line-cap': 'round', 'line-join': 'round' },
			paint: {
				'line-color': ['get', 'color'],
				'line-width': 2.5,
				'line-dasharray': [1.5, 2],
				'line-opacity': 0.95
			}
		},
		before
	);

	map.addLayer({
		id: SAT_DOT_LAYER,
		type: 'circle',
		source: SAT_POINT_SOURCE,
		paint: {
			'circle-radius': 10,
			'circle-color': ['get', 'color'],
			'circle-stroke-color': dark ? '#0b0b0b' : '#ffffff',
			'circle-stroke-width': 2.5
		}
	});

	map.addLayer({
		id: SAT_LABEL_LAYER,
		type: 'symbol',
		source: SAT_POINT_SOURCE,
		layout: {
			'text-field': ['get', 'label'],
			'text-font': ['Noto Sans Regular'],
			'text-size': 18,
			'text-offset': [0, 0.9],
			'text-anchor': 'top',
			'text-allow-overlap': true,
			'text-ignore-placement': true
		},
		paint: {
			'text-color': dark ? '#f5f5f5' : '#111827',
			'text-halo-color': dark ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.95)',
			'text-halo-width': 2
		}
	});
};
