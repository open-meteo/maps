import { get } from 'svelte/store';

import {
	type Domain,
	GridFactory,
	domainOptions,
	getDomainFootprint,
	getFallbackDomain
} from '@openmeteo/weather-map-layer';
import { mode } from 'mode-watcher';

import { loading } from '$lib/stores/preferences';
import { selectedDomain } from '$lib/stores/variables';

import { BEFORE_LAYER_VECTOR } from '$lib/constants';

import type * as maplibregl from 'maplibre-gl';

/**
 * Reproducible domain screenshots.
 *
 * When the map is opened with `?screenshot=1` the app strips all UI chrome,
 * frames the selected domain and draws a clean outline around it, then exposes a
 * couple of hooks on `window` so an external driver (see
 * `scripts/domain-screenshots.mjs`) can enumerate the domains and know when a
 * frame is fully rendered and safe to capture.
 *
 * The domain outline reuses the weather-map-layer boundary primitives introduced
 * with the seamless-domain work (`getDomainFootprint` for NULL-padded reprojected
 * grids, otherwise the grid's own boundary polygon), so the border hugs each
 * domain's true footprint instead of a plain lat/lon rectangle.
 */

const SCREENSHOT_SOURCE_ID = 'domainBorderSource';
const SCREENSHOT_LINE_ID = 'domainBorderLine';

/**
 * Weather-raster opacity (%) used in screenshot mode — kept below 100 so the base
 * map coastlines/labels and the domain border stay readable underneath. Override
 * per-capture with the `?opacity=` URL param.
 */
export const SCREENSHOT_RASTER_OPACITY = 60;

/**
 * Domains that should reuse another domain's boundary. The Météo-France AROME
 * France models (0.025°, HD, and their 15-min variants) all cover the same area,
 * but only the base 0.025° domain ships a precomputed footprint — the others would
 * otherwise fall back to a plain bounding rectangle, so they borrow it here.
 */
const BOUNDARY_ALIASES: Record<string, string> = {
	meteofrance_arome_france0025_15min: 'meteofrance_arome_france0025',
	meteofrance_arome_france_hd: 'meteofrance_arome_france0025',
	meteofrance_arome_france_hd_15min: 'meteofrance_arome_france0025'
};

declare global {
	interface Window {
		/** All selectable domains, for the screenshot driver to iterate. */
		__omDomains?: { value: string; label: string; global: boolean }[];
		/** Set to true once the current domain frame is fully rendered. */
		__omScreenshotReady?: boolean;
	}
}

/** Whether the app is running in screenshot mode (`?screenshot=1`). */
export const isScreenshotMode = (): boolean => {
	if (typeof window === 'undefined') return false;
	const value = new URLSearchParams(window.location.search).get('screenshot');
	return value !== null && value !== 'false' && value !== '0';
};

/** Padding (in CSS pixels) kept around the domain footprint when framing it. */
const framePadding = (): number => {
	const fallback = 90;
	if (typeof window === 'undefined') return fallback;
	const raw = new URLSearchParams(window.location.search).get('padding');
	const value = raw ? Number(raw) : NaN;
	return Number.isFinite(value) ? value : fallback;
};

/** Boundary ring ([lng, lat] pairs) for the currently selected domain. */
const domainBoundaryRing = (): Array<[number, number]> | undefined => {
	const domain = get(selectedDomain);
	const footprintKey = BOUNDARY_ALIASES[domain.value] ?? domain.value;
	try {
		return (
			getDomainFootprint(footprintKey) ?? GridFactory.create(domain.grid, null).getBoundaryPolygon()
		);
	} catch {
		return undefined;
	}
};

// Web-Mercator vertical position as a 0..1 fraction (0 = north edge), clamped to the
// projection's usable latitude range.
const MAX_MERCATOR_LAT = 85;
const mercatorY = (lat: number): number => {
	const rad = (Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat)) * Math.PI) / 180;
	return (1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2;
};
const mercatorLat = (y: number): number =>
	(Math.atan(Math.sinh((1 - 2 * y) * Math.PI)) * 180) / Math.PI;

/** Great-circle centroid of a ring of [lng, lat] points (wrap/pole safe). */
const sphericalCentroid = (ring: Array<[number, number]>): { lng: number; lat: number } => {
	let x = 0,
		y = 0,
		z = 0;
	for (const [lng, lat] of ring) {
		const la = (lat * Math.PI) / 180;
		const lo = (lng * Math.PI) / 180;
		x += Math.cos(la) * Math.cos(lo);
		y += Math.cos(la) * Math.sin(lo);
		z += Math.sin(la);
	}
	return {
		lng: (Math.atan2(y, x) * 180) / Math.PI,
		lat: (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI
	};
};

/** Frame the map on the selected domain's footprint. */
export const fitToDomain = (map: maplibregl.Map): void => {
	const domain = get(selectedDomain);

	const ring = domainBoundaryRing();
	if (ring && ring.length > 0) {
		let minLng = Infinity,
			minLat = Infinity,
			maxLng = -Infinity,
			maxLat = -Infinity;
		for (const [lng, lat] of ring) {
			if (lng < minLng) minLng = lng;
			if (lat < minLat) minLat = lat;
			if (lng > maxLng) maxLng = lng;
			if (lat > maxLat) maxLat = lat;
		}

		// A footprint that wraps ~360° of longitude can't be framed by its bounding box
		// (the box would span the whole world). This happens for genuinely global grids
		// and for rotated-pole regional grids (e.g. GEM RDPS) whose perimeter fans across
		// the pole. Center on the true (spherical) centroid and pick a zoom that fits the
		// latitude range — so RDPS lands over North America instead of at [0, 0].
		if (maxLng - minLng >= 359) {
			const center = sphericalCentroid(ring);
			const yTop = mercatorY(maxLat);
			const yBot = mercatorY(minLat);
			const latFraction = Math.abs(yBot - yTop) || 1;
			const usableHeight = Math.max(50, map.getContainer().clientHeight - 2 * framePadding());
			// maplibre worldSize = 512 * 2^zoom. Zoom out a bit extra so the wide parts
			// of a pole-fanning footprint (e.g. RDPS's east/west edges) stay in frame.
			const zoom = Math.log2(usableHeight / latFraction / 512) - 1.0;
			map.jumpTo({ center: [center.lng, mercatorLat((yTop + yBot) / 2)], zoom });
			return;
		}

		// Clamp to valid Web Mercator latitudes (poles project to infinity).
		minLat = Math.max(-MAX_MERCATOR_LAT, minLat);
		maxLat = Math.min(MAX_MERCATOR_LAT, maxLat);
		if (
			[minLng, minLat, maxLng, maxLat].every(Number.isFinite) &&
			maxLng > minLng &&
			maxLat > minLat
		) {
			map.fitBounds(
				[
					[minLng, minLat],
					[maxLng, maxLat]
				],
				{ padding: framePadding(), duration: 0, maxZoom: 12 }
			);
			return;
		}
	}

	// Fall back to the grid's own center/zoom if no usable boundary is available.
	const grid = GridFactory.create(domain.grid);
	map.jumpTo({ center: grid.getCenter(), zoom: domain.grid.zoom });
};

/** Draw a clean outline around the selected domain's footprint. */
export const drawDomainBorder = (map: maplibregl.Map): void => {
	if (map.getLayer(SCREENSHOT_LINE_ID)) map.removeLayer(SCREENSHOT_LINE_ID);
	if (map.getSource(SCREENSHOT_SOURCE_ID)) map.removeSource(SCREENSHOT_SOURCE_ID);

	const ring = domainBoundaryRing();
	if (!ring || ring.length === 0) return;

	map.addSource(SCREENSHOT_SOURCE_ID, {
		type: 'geojson',
		// Drawn as a LineString (not a Polygon): the ring already closes on itself and
		// a polygon's implicit closing segment can jump ~360° for boundaries crossing
		// the antimeridian or encircling a pole.
		data: {
			type: 'Feature',
			properties: {},
			geometry: { type: 'LineString', coordinates: ring }
		}
	});

	map.addLayer(
		{
			id: SCREENSHOT_LINE_ID,
			type: 'line',
			source: SCREENSHOT_SOURCE_ID,
			layout: { 'line-cap': 'round', 'line-join': 'round' },
			paint: {
				// Deep blue on the light base map; a much brighter blue so it stays legible
				// against the dark base map.
				'line-color': mode.current === 'dark' ? 'rgba(120,195,255,1)' : 'rgba(15,80,205,0.95)',
				'line-width': 2.5,
				'line-dasharray': [4, 3]
			}
		},
		map.getLayer(BEFORE_LAYER_VECTOR) ? BEFORE_LAYER_VECTOR : undefined
	);
};

/**
 * Whether a domain's grid spans (essentially) the whole globe.
 *
 * A regular lat/lon grid whose longitude span is ~360° genuinely covers every
 * longitude (e.g. global wave bands), so that alone marks it global. A projected /
 * rotated-pole grid, however, can have a geographic bounding box that wraps ~360°
 * near the pole while only covering a region (e.g. GEM RDPS over North America), so
 * for those we additionally require a wide latitude span before calling it global.
 */
const isGlobalDomain = (grid: Domain['grid']): boolean => {
	try {
		const [minLng, minLat, maxLng, maxLat] = GridFactory.create(grid).getBounds();
		if (maxLng - minLng < 350) return false;
		const isProjected = 'projection' in grid && grid.projection != null;
		return isProjected ? maxLat - minLat >= 140 : true;
	} catch {
		return false;
	}
};

/** Expose the full domain list so the driver can enumerate what to capture. */
export const exposeDomainList = (): void => {
	if (typeof window === 'undefined') return;
	window.__omDomains = domainOptions.map((d) => {
		// Resolve to the concrete backing domain for the grid; seamless composites
		// have no single footprint, so treat them as global (the driver skips them).
		const concrete = getFallbackDomain(d, domainOptions);
		return {
			value: d.value,
			label: d.label ?? d.value,
			global: concrete ? isGlobalDomain(concrete.grid) : true
		};
	});
};

/**
 * Flip `window.__omScreenshotReady` once data has finished loading and the map has
 * settled (no in-flight tiles / animations). The driver polls this flag.
 */
export const markReadyWhenSettled = (map: maplibregl.Map): void => {
	if (typeof window === 'undefined') return;
	window.__omScreenshotReady = false;

	let settleTimer: ReturnType<typeof setTimeout> | undefined;

	const trySettle = () => {
		if (get(loading)) return; // still fetching data
		if (settleTimer) clearTimeout(settleTimer);
		// Wait for a quiet period with no further loading before declaring ready.
		settleTimer = setTimeout(() => {
			if (!get(loading) && map.loaded() && !map.isMoving() && !map.isZooming()) {
				window.__omScreenshotReady = true;
			} else {
				map.once('idle', trySettle);
			}
		}, 800);
	};

	loading.subscribe(() => trySettle());
	map.on('idle', trySettle);
};
