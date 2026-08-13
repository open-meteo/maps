import { GridFactory, domainOptions, getDomainFootprint } from '@openmeteo/weather-map-layer';
import {
	difference,
	featureCollection,
	intersect,
	polygon as turfPolygon,
	union
} from '@turf/turf';
import { mode } from 'mode-watcher';

import { BEFORE_LAYER_VECTOR } from '$lib/constants';

import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import type * as maplibregl from 'maplibre-gl';

/**
 * Best-match region screenshot view (`?screenshot=best-match&view=europe|world`).
 *
 * A companion to the per-domain screenshots (`screenshot.ts`) and the satellite
 * coverage view (`satellite-screenshot.ts`): instead of framing one model, this paints
 * the regions the Forecast API's default `best_match` model selection routes to, so the
 * website's "Best Match Model Selection" docs section can show which regional model wins
 * where — in the same light/dark style as every other model-area image.
 *
 * The regions mirror `MultiDomains.best_match` in the API
 * (open-meteo/Sources/App/Controllers/ForecastapiController.swift): an ordered list where
 * the first match wins. Each region is therefore drawn as its own area *minus* every
 * higher-priority region, so the painted shapes are the areas each model actually serves
 * rather than raw, overlapping model footprints.
 */

/** Whether the app is in the best-match region screenshot view. */
export const isBestMatchScreenshot = (): boolean => {
	if (typeof window === 'undefined') return false;
	return new URLSearchParams(window.location.search).get('screenshot') === 'best-match';
};

export type BestMatchView = 'europe' | 'world';

/** Which frame to capture; `world` also covers North America and Japan. */
export const bestMatchView = (): BestMatchView => {
	if (typeof window === 'undefined') return 'europe';
	return new URLSearchParams(window.location.search).get('view') === 'world' ? 'world' : 'europe';
};

/** Rectangular lat/lon constraint, matching the API's `(a..<b).contains(...)` checks. */
interface LatLonBox {
	latMin: number;
	latMax: number;
	lonMin: number;
	lonMax: number;
}

interface RegionLabel {
	/** Where the label text sits. */
	at: [number, number];
	/** Optional leader line drawn from the label to the region it names. */
	leader?: [number, number];
	anchor?: 'center' | 'top' | 'bottom' | 'left' | 'right';
}

interface Region {
	/** Region name as shown in the docs table. */
	name: string;
	/** Regional model(s) the API adds on top of the global backbone. */
	model: string;
	/** Categorical palette slot (validated all-pairs in both modes — see PALETTE). */
	light: string;
	dark: string;
	/** Domain whose footprint bounds the region, when it is not a plain rectangle. */
	domain?: string;
	/** Lat/lon box the API checks before using the regional model. */
	box?: LatLonBox;
	/** Area carved back out of the region (the API's English Channel cut-out). */
	cutout?: Position[];
	labels: Partial<Record<BestMatchView, RegionLabel>>;
}

/**
 * The `best_match` routing table, in the API's evaluation order — the first region that
 * contains a coordinate wins, so later entries are drawn minus all earlier ones.
 *
 * The nine colours are one categorical palette: hues shared between light and dark, each
 * stepped for its own surface. Checked all-pairs (every region can border every other on
 * a map, not just its neighbour in this list): worst CVD ΔE 9.6 light / 8.9 dark and worst
 * normal-vision ΔE 16.5 in both, against targets of 8 and 15. Several steps fall below 3:1
 * against the base map, so every region carries a direct label — colour never has to carry
 * a region's identity on its own.
 */
const REGIONS: Region[] = [
	{
		name: 'Netherlands & Belgium',
		model: 'KNMI HARMONIE',
		light: '#1fc4b5',
		dark: '#00998c',
		domain: 'knmi_harmonie_arome_netherlands',
		box: { latMin: 49.35, latMax: 53.79, lonMin: 2.19, lonMax: 7.66 },
		labels: {
			// Too small to hold its own label at this scale: the text sits over Denmark with a
			// leader line back down into the region.
			europe: { at: [9.9, 56.9], anchor: 'left', leader: [7.3, 53.7] }
		}
	},
	{
		name: 'Scandinavia',
		model: 'MET Nordic',
		light: '#d3964c',
		dark: '#be7904',
		domain: 'metno_nordic_pp',
		box: { latMin: 54.9, latMax: 90, lonMin: -180, lonMax: 180 },
		labels: {
			europe: { at: [17.5, 66.5] }
		}
	},
	{
		name: 'United Kingdom & Ireland',
		model: 'UKMO UK 2 km',
		light: '#951057',
		dark: '#9a3b65',
		// The API checks a plain rectangle here rather than the model footprint, with a
		// triangle cut out of the south-east corner so northern France is not claimed.
		box: { latMin: 49.9, latMax: 61, lonMin: -11, lonMax: 1.8 },
		cutout: [
			[-0.2, 49.9],
			[1.8, 49.9],
			[1.8, 51.1],
			[-0.2, 49.9]
		],
		labels: {
			europe: { at: [-4.6, 57.2] }
		}
	},
	{
		name: 'Central Europe',
		model: 'ICON D2',
		light: '#2f7eb6',
		dark: '#06669e',
		domain: 'dwd_icon_d2',
		labels: {
			europe: { at: [14.4, 50.6] }
		}
	},
	{
		name: 'France & Western Europe',
		model: 'AROME France HD',
		light: '#5f7127',
		dark: '#586a13',
		// arome_france_hd has no precomputed footprint of its own; the 0.025° domain covers
		// exactly the same area (see BOUNDARY_ALIASES in screenshot.ts).
		domain: 'meteofrance_arome_france0025',
		box: { latMin: 42.1, latMax: 51.32, lonMin: -6.18, lonMax: 8.35 },
		labels: {
			europe: { at: [0.4, 44.2] }
		}
	},
	{
		name: 'Northern Europe & Iceland',
		model: 'DMI HARMONIE',
		light: '#9a58f5',
		dark: '#7d14dd',
		domain: 'dmi_harmonie_arome_europe',
		box: { latMin: 44, latMax: 66, lonMin: -180, lonMax: 180 },
		labels: {
			europe: { at: [-19.5, 64.8], anchor: 'bottom' }
		}
	},
	{
		name: 'North America',
		model: 'NOAA HRRR',
		light: '#d192fb',
		dark: '#c153ff',
		domain: 'ncep_hrrr_conus',
		labels: {
			world: { at: [-100, 39] }
		}
	},
	{
		name: 'Japan',
		model: 'JMA MSM',
		light: '#512cc7',
		dark: '#8988cc',
		domain: 'jma_msm',
		box: { latMin: 27.4, latMax: 42.65, lonMin: 125, lonMax: 145 },
		labels: {
			world: { at: [138, 19.5], leader: [136.5, 27.5] }
		}
	},
	{
		name: 'Remaining Europe',
		model: 'ICON EU',
		// Rose rather than the lilac slot: this region shares its whole eastern border with
		// Northern Europe's violet, and the two purples were hard to separate in dark mode.
		light: '#b06372',
		dark: '#f24c79',
		domain: 'dwd_icon_eu',
		labels: {
			europe: { at: [44, 38] },
			world: { at: [42, 35] }
		}
	}
];

const BEST_MATCH_FILL_SOURCE = 'bestMatchFillSource';
const BEST_MATCH_LEADER_SOURCE = 'bestMatchLeaderSource';
const BEST_MATCH_LABEL_SOURCE = 'bestMatchLabelSource';
const BEST_MATCH_FILL_LAYER = 'bestMatchFillLayer';
const BEST_MATCH_LINE_LAYER = 'bestMatchLineLayer';
const BEST_MATCH_LEADER_LAYER = 'bestMatchLeaderLayer';
const BEST_MATCH_LABEL_LAYER = 'bestMatchLabelLayer';

/** Frames for the two captures, as [west, south, east, north]. */
const VIEW_BOUNDS: Record<BestMatchView, [number, number, number, number]> = {
	// A close-up: wide enough for the ICON EU grid and tall enough for the MET Nordic
	// footprint's Arctic edge. The DMI HARMONIE footprint reaches further into the North
	// Atlantic (-43°E) than this frame shows — the world view below covers it in full.
	europe: [-30, 28, 64, 75],
	// Every region's full extent, from the DMI footprint in the west to Japan in the east.
	// Framed to the same aspect as the Europe view so the two sit side by side in the docs.
	world: [-145, -55, 155, 78]
};

const closeRing = (ring: Position[]): Position[] => {
	if (ring.length === 0) return ring;
	const [first, last] = [ring[0], ring[ring.length - 1]];
	return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
};

/** Boundary ring for a domain: its precomputed data footprint, else the grid's own box. */
const domainRing = (domainValue: string): Position[] | undefined => {
	const footprint = getDomainFootprint(domainValue);
	if (footprint) return closeRing(footprint.map(([lng, lat]) => [lng, lat] as Position));
	// Every region here names a concrete grid-bearing domain; the seamless composites in
	// `domainOptions` carry no grid of their own and are not usable as a footprint.
	const domain = domainOptions.find((d) => d.value === domainValue);
	if (!domain || !('grid' in domain)) return undefined;
	try {
		return closeRing(
			GridFactory.create(domain.grid, null)
				.getBoundaryPolygon()
				.map(([lng, lat]) => [lng, lat] as Position)
		);
	} catch {
		return undefined;
	}
};

const boxRing = ({ latMin, latMax, lonMin, lonMax }: LatLonBox): Position[] => [
	[lonMax, latMin],
	[lonMax, latMax],
	[lonMin, latMax],
	[lonMin, latMin],
	[lonMax, latMin]
];

type AnyPolygon = Feature<Polygon | MultiPolygon>;

/**
 * The area a region covers before priority is applied: its model footprint (or the
 * region's own rectangle), narrowed by the API's lat/lon check and with the English
 * Channel triangle removed where one is defined.
 */
const regionArea = (region: Region): AnyPolygon | null => {
	const base = region.domain ? domainRing(region.domain) : region.box && boxRing(region.box);
	if (!base) return null;

	let area: AnyPolygon | null = turfPolygon([base]);
	if (region.domain && region.box) {
		area = intersect(featureCollection([area, turfPolygon([boxRing(region.box)])]));
	}
	if (area && region.cutout) {
		area = difference(featureCollection([area, turfPolygon([closeRing(region.cutout)])]));
	}
	return area;
};

/**
 * Region areas with the API's first-match-wins precedence applied: each region minus the
 * union of every higher-priority region, so no two painted areas overlap.
 */
const bestMatchAreas = (): Array<{ region: Region; area: AnyPolygon }> => {
	const out: Array<{ region: Region; area: AnyPolygon }> = [];
	let claimed: AnyPolygon | null = null;

	for (const region of REGIONS) {
		const area = regionArea(region);
		if (!area) continue;

		const remaining = claimed ? difference(featureCollection([area, claimed])) : area;
		if (remaining) out.push({ region, area: remaining });

		claimed = claimed ? union(featureCollection([claimed, area])) : area;
	}
	return out;
};

/** Frame the map on the requested view. */
export const fitBestMatchView = (map: maplibregl.Map, view: BestMatchView): void => {
	const [west, south, east, north] = VIEW_BOUNDS[view];
	map.fitBounds(
		[
			[west, south],
			[east, north]
		],
		{ padding: 12, duration: 0 }
	);
};

/** Paint the best-match regions, their outlines, leader lines and labels. */
export const drawBestMatchRegions = (map: maplibregl.Map, view: BestMatchView): void => {
	const dark = mode.current === 'dark';
	const color = (region: Region) => (dark ? region.dark : region.light);

	const areas = bestMatchAreas();

	map.addSource(BEST_MATCH_FILL_SOURCE, {
		type: 'geojson',
		data: {
			type: 'FeatureCollection',
			features: areas.map(({ region, area }) => ({
				...area,
				properties: { color: color(region) }
			}))
		}
	});

	const labelled = areas
		.map(({ region }) => ({ region, label: region.labels[view] }))
		.filter((entry): entry is { region: Region; label: RegionLabel } => Boolean(entry.label));

	map.addSource(BEST_MATCH_LEADER_SOURCE, {
		type: 'geojson',
		data: {
			type: 'FeatureCollection',
			features: labelled
				.filter(({ label }) => label.leader)
				.map(({ region, label }) => ({
					type: 'Feature',
					properties: { color: color(region) },
					geometry: { type: 'LineString', coordinates: [label.at, label.leader as Position] }
				}))
		}
	});

	map.addSource(BEST_MATCH_LABEL_SOURCE, {
		type: 'geojson',
		data: {
			type: 'FeatureCollection',
			features: labelled.map(({ region, label }) => ({
				type: 'Feature',
				properties: {
					name: region.name,
					model: region.model,
					anchor: label.anchor ?? 'center'
				},
				geometry: { type: 'Point', coordinates: label.at }
			}))
		}
	});

	// Keep the regions under the base map's place labels so coastlines and city names
	// stay readable through the fills.
	const before = map.getLayer(BEFORE_LAYER_VECTOR) ? BEFORE_LAYER_VECTOR : undefined;

	map.addLayer(
		{
			id: BEST_MATCH_FILL_LAYER,
			type: 'fill',
			source: BEST_MATCH_FILL_SOURCE,
			paint: {
				'fill-color': ['get', 'color'],
				'fill-opacity': dark ? 0.45 : 0.38
			}
		},
		before
	);

	map.addLayer(
		{
			id: BEST_MATCH_LINE_LAYER,
			type: 'line',
			source: BEST_MATCH_FILL_SOURCE,
			layout: { 'line-cap': 'round', 'line-join': 'round' },
			paint: {
				'line-color': ['get', 'color'],
				'line-width': 2,
				'line-opacity': 0.95
			}
		},
		before
	);

	map.addLayer({
		id: BEST_MATCH_LEADER_LAYER,
		type: 'line',
		source: BEST_MATCH_LEADER_SOURCE,
		layout: { 'line-cap': 'round' },
		paint: { 'line-color': ['get', 'color'], 'line-width': 2 }
	});

	map.addLayer({
		id: BEST_MATCH_LABEL_LAYER,
		type: 'symbol',
		source: BEST_MATCH_LABEL_SOURCE,
		layout: {
			'text-field': [
				'format',
				['get', 'name'],
				{ 'text-font': ['literal', ['Noto Sans Medium']] },
				'\n',
				{},
				['get', 'model'],
				{ 'font-scale': 0.85 }
			],
			'text-font': ['Noto Sans Regular'],
			'text-size': 17,
			'text-anchor': ['get', 'anchor'],
			'text-offset': [
				'match',
				['get', 'anchor'],
				'left',
				['literal', [0.5, 0]],
				'right',
				['literal', [-0.5, 0]],
				'bottom',
				['literal', [0, -0.4]],
				'top',
				['literal', [0, 0.4]],
				['literal', [0, 0]]
			],
			'text-line-height': 1.15,
			'text-allow-overlap': true,
			'text-ignore-placement': true
		},
		paint: {
			// Labels wear the map's ink, not the region colour — the fill beside them
			// carries identity, so the text stays readable at any fill opacity.
			'text-color': dark ? '#f5f5f5' : '#111827',
			'text-halo-color': dark ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.95)',
			'text-halo-width': 2
		}
	});
};
