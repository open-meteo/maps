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

import type { LineString, MultiLineString } from 'geojson';
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

/**
 * Valid-data latitude extent for domains whose files are padded with all-noData
 * rows: the model fills less than the declared grid, so the outline would
 * otherwise float outside the visible raster. Values are the outer cell edges of
 * the first/last rows that contain data, measured by scanning the spatial om
 * files across several runs and lead times (the mask is a stable property of the
 * model, not of individual runs).
 */
const VALID_DATA_EXTENT: Record<string, { latMin: number; latMax: number }> = {
	// Grid declares −15…52.5 but rows south of −12.5 / north of 52.17 are noData.
	ncep_gfswave016: { latMin: -15 + 14.5 / 6, latMax: -15 + 403.5 / 6 }
};

/** Boundary ring ([lng, lat] pairs) for the currently selected domain. */
const domainBoundaryRing = (): Array<[number, number]> | undefined => {
	const domain = get(selectedDomain);
	const footprintKey = BOUNDARY_ALIASES[domain.value] ?? domain.value;
	try {
		const ring =
			getDomainFootprint(footprintKey) ??
			GridFactory.create(domain.grid, null).getBoundaryPolygon();
		const extent = VALID_DATA_EXTENT[domain.value];
		if (ring && extent) {
			return ring.map(([lng, lat]) => [lng, Math.min(extent.latMax, Math.max(extent.latMin, lat))]);
		}
		return ring;
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

		// A projected/rotated-pole footprint can wrap ~360° of longitude while only
		// covering a region (e.g. GEM RDPS, whose perimeter fans across the pole), so its
		// bounding box would span the whole world. Center on the true (spherical) centroid
		// and pick a zoom that fits the latitude range — so RDPS lands over North America
		// instead of at [0, 0]. Non-projected grids covering all longitudes (global grids
		// and latitude bands like GFS Wave 0.16°) frame fine via their bounding box below.
		const isProjected = 'projection' in domain.grid && domain.grid.projection != null;
		if (maxLng - minLng >= 359 && isProjected) {
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

/**
 * Border geometry for a boundary ring. Drawn as line strings (not a Polygon): the
 * ring already closes on itself and a polygon's implicit closing segment can jump
 * ~360° for boundaries crossing the antimeridian or encircling a pole.
 *
 * For a non-projected grid covering every longitude (global grids and latitude
 * bands like GFS Wave 0.16°) the ring's west and east edges are the same meridian,
 * so the segments running along ±180° are dropped — they would render as a
 * spurious vertical dashed line on every world copy. Projected footprints (e.g.
 * GEM RDPS) whose bounding box merely wraps ~360° near the pole keep their full
 * outline.
 */
const domainBorderGeometry = (ring: Array<[number, number]>): LineString | MultiLineString => {
	const domain = get(selectedDomain);
	const isProjected = 'projection' in domain.grid && domain.grid.projection != null;
	let minLng = Infinity,
		maxLng = -Infinity;
	for (const [lng] of ring) {
		if (lng < minLng) minLng = lng;
		if (lng > maxLng) maxLng = lng;
	}
	if (isProjected || maxLng - minLng < 359) return { type: 'LineString', coordinates: ring };

	// Segment lies on the antimeridian: constant longitude at ±180°.
	const onAntimeridian = (a: [number, number], b: [number, number]) =>
		Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(Math.abs(a[0]) - 180) < 1e-6;

	const lines: Array<Array<[number, number]>> = [];
	let run: Array<[number, number]> = [];
	for (let i = 0; i < ring.length - 1; i++) {
		const a = ring[i];
		const b = ring[i + 1];
		if (onAntimeridian(a, b)) {
			if (run.length > 1) lines.push(run);
			run = [];
			continue;
		}
		if (run.length === 0) run.push(a);
		run.push(b);
	}
	if (run.length > 1) lines.push(run);
	return { type: 'MultiLineString', coordinates: lines };
};

/** Draw a clean outline around the selected domain's footprint. */
export const drawDomainBorder = (map: maplibregl.Map): void => {
	if (map.getLayer(SCREENSHOT_LINE_ID)) map.removeLayer(SCREENSHOT_LINE_ID);
	if (map.getSource(SCREENSHOT_SOURCE_ID)) map.removeSource(SCREENSHOT_SOURCE_ID);

	const ring = domainBoundaryRing();
	if (!ring || ring.length === 0) return;

	map.addSource(SCREENSHOT_SOURCE_ID, {
		type: 'geojson',
		data: {
			type: 'Feature',
			properties: {},
			geometry: domainBorderGeometry(ring)
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
 * Covering every longitude alone is not enough: a latitude-band grid (e.g. GFS Wave
 * 0.16°, −15°…52.5°) still has a meaningful footprint to frame, and a projected /
 * rotated-pole grid can have a geographic bounding box that wraps ~360° near the
 * pole while only covering a region (e.g. GEM RDPS over North America). Only grids
 * that also span (nearly) all latitudes are treated as global.
 */
const isGlobalDomain = (grid: Domain['grid']): boolean => {
	try {
		const [minLng, minLat, maxLng, maxLat] = GridFactory.create(grid).getBounds();
		return maxLng - minLng >= 350 && maxLat - minLat >= 140;
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
