import { get } from 'svelte/store';

import {
	type Domain,
	GridFactory,
	domainOptions,
	updateCurrentBounds
} from '@openmeteo/weather-map-layer';
import { mode } from 'mode-watcher';
import { apply } from 'ol-mapbox-style';
import Map from 'ol/Map';
import View from 'ol/View';
import Attribution from 'ol/control/Attribution';
import Zoom from 'ol/control/Zoom';
import { defaults as defaultInteractions } from 'ol/interaction/defaults';
import LayerGroup from 'ol/layer/Group';
import { fromLonLat, toLonLat, transformExtent } from 'ol/proj';

import { map as m } from '$lib/stores/map';
import { preferences as p } from '$lib/stores/preferences';
import { domain as d } from '$lib/stores/variables';

import { LocateButton, controlColumn } from '$lib/components/buttons';

import { BEFORE_LAYER_RASTER } from '$lib/constants';

import { addOmFileLayers } from './layers';
import { registerOmProtocol } from './om-adapter';

/** The parts of a MapLibre style sheet the basemap split looks at. */
interface StyleSheet {
	layers: { id: string; type: string }[];
	[key: string]: unknown;
}

/**
 * OpenLayers stacks layers by zIndex. The basemap is one MapLibre style
 * rendered by ol-mapbox-style into two layer groups: everything below the
 * raster insertion point of the MapLibre app goes under the weather,
 * everything from there on (boundaries, roads, labels) is drawn on top of
 * it, so the weather sits under the labels exactly as in the MapLibre app.
 */
export const Z_INDEX = { basemap: 0, raster: 100, vector: 200, labels: 1000 };

let basemapLower: LayerGroup | undefined;
let basemapUpper: LayerGroup | undefined;

/**
 * OpenLayers tiles the world into 256 px tiles where MapLibre uses 512 px,
 * so the same view is one zoom level higher here. Zooms from the domain
 * table and the URL hash are MapLibre zooms and converted here, which keeps
 * the hash interchangeable with the MapLibre app.
 */
const ZOOM_OFFSET = 1;

/** Where a global domain opens without a hash: Europe, like the MapLibre app's users expect. */
const EUROPE = { lng: 10, lat: 50, zoom: 3 };

/** The MapLibre `#zoom/lat/lng` hash OpenLayers does not maintain itself. */
export const getHashString = (): string => {
	const map = get(m);
	const view = map?.getView();
	const center = view?.getCenter();
	const rawZoom = view?.getZoom();
	if (!center || rawZoom === undefined) return '';
	const [lng, lat] = toLonLat(center);
	const zoom = Math.round((rawZoom - ZOOM_OFFSET) * 100) / 100;
	// Enough decimals for one pixel at this zoom (MapLibre's rule)
	const precision = Math.max(
		0,
		Math.ceil((zoom * Math.LN2 + Math.log(512 / 360 / 0.5)) / Math.LN10)
	);
	return `#${zoom}/${lat.toFixed(precision)}/${lng.toFixed(precision)}`;
};

const parseHash = (): { lng: number; lat: number; zoom: number } | undefined => {
	const parts = window.location.hash.replace('#', '').split('/');
	if (parts.length < 3) return undefined;
	const [zoom, lat, lng] = parts.map(Number);
	if (![zoom, lat, lng].every(Number.isFinite)) return undefined;
	return { lng, lat, zoom };
};

const writeHash = (): void => {
	const hash = getHashString();
	if (!hash) return;
	window.history.replaceState(window.history.state, '', location.href.replace(/(#.+)?$/, hash));
};

export const createMap = async (container: HTMLElement) => {
	registerOmProtocol();

	const domainObject = domainOptions.find(({ value }: Domain) => value === get(d));
	if (!domainObject) {
		throw new Error('Domain not found');
	}
	const grid = GridFactory.create(domainObject.grid);
	const { lng, lat } = grid.getCenter();
	const bounds = grid.getBounds();
	const global = bounds[2] - bounds[0] >= 359;
	const hash = parseHash();
	const start = hash ?? (global ? EUROPE : { lng, lat, zoom: domainObject.grid.zoom ?? 1 });

	const column = controlColumn();
	const map = new Map({
		target: container,
		layers: [],
		// The zoom buttons join the app's buttons in one column on the right
		controls: [new Zoom({ target: column }), new Attribution({ collapsible: false })],
		interactions: defaultInteractions({
			keyboard: false,
			altShiftDragRotate: false,
			pinchRotate: false
		}),
		view: new View({
			center: fromLonLat([start.lng, start.lat]),
			zoom: start.zoom + ZOOM_OFFSET,
			maxZoom: 20
		})
	});
	// Controls with a `target` are placed by the app; the stop-event container
	// keeps their clicks away from the map
	map.getOverlayContainerStopEvent().appendChild(column);
	m.set(map);

	await addBasemap(map);
	setMapControlSettings();

	map.on('moveend', writeHash);
	// update bounds when the view changes, to trigger new data ranges loading if necessary
	const syncBounds = () => {
		const size = map.getSize();
		if (!size) return;
		const [minLng, minLat, maxLng, maxLat] = transformExtent(
			map.getView().calculateExtent(size),
			'EPSG:3857',
			'EPSG:4326'
		);
		// The view may extend past ±180° when wrapping
		updateCurrentBounds([Math.max(minLng, -180), minLat, Math.min(maxLng, 180), maxLat]);
	};
	map.on('moveend', syncBounds);
	syncBounds();

	return map;
};

/** Run `callback` once the map is ready for layers (OpenLayers: after its first render). */
export const whenMapReady = (map: Map, callback: () => void): void => {
	map.once('postrender', callback);
};

export const setMapControlSettings = () => {
	const map = get(m);
	if (!map) return;

	// OpenLayers has no geolocate control; the button wraps `Geolocation`
	map.addControl(new LocateButton());
};

// Mode the currently applied basemap style was fetched for. Can drift from
// mode.current: when an embedding page's color-scheme propagates into our
// prefers-color-scheme, mode-watcher flips the UI mode without any style
// reload happening.
let appliedStyleMode: 'light' | 'dark' = 'light';

export const getAppliedStyleMode = () => appliedStyleMode;

export const getStyle = async (): Promise<StyleSheet> => {
	const preferences = get(p);
	appliedStyleMode = mode.current === 'dark' ? 'dark' : 'light';
	return fetch(
		`https://static-assets.open-meteo.com/map-assets/styles/minimal-planet-maps${appliedStyleMode === 'dark' ? '-dark' : ''}${preferences.clipWater ? '-water-clip' : ''}.json`
	).then((r) => r.json());
};

/** The style split at the raster insertion point: [below the weather, above it]. */
const splitStyle = (style: StyleSheet): [StyleSheet, StyleSheet] => {
	const at = style.layers.findIndex((layer) => layer.id === BEFORE_LAYER_RASTER);
	const cut = at === -1 ? style.layers.length : at;
	return [
		{ ...style, layers: style.layers.slice(0, cut) },
		// The upper group must stay see-through
		{ ...style, layers: style.layers.slice(cut).filter((layer) => layer.type !== 'background') }
	];
};

/** Render a style into a group; the group's zIndex places all of its layers. */
const applyGroup = async (style: StyleSheet, zIndex: number): Promise<LayerGroup> => {
	const group = new LayerGroup({ zIndex });
	await apply(group, style);
	return group;
};

const addBasemap = async (map: Map): Promise<void> => {
	const [lower, upper] = splitStyle(await getStyle());
	[basemapLower, basemapUpper] = await Promise.all([
		applyGroup(lower, Z_INDEX.basemap),
		applyGroup(upper, Z_INDEX.labels)
	]);
	map.addLayer(basemapLower);
	map.addLayer(basemapUpper);
};

export const reloadStyles = () => {
	getStyle().then(async (style) => {
		const map = get(m);
		if (!map) return;
		if (basemapLower) map.removeLayer(basemapLower);
		if (basemapUpper) map.removeLayer(basemapUpper);
		basemapLower = basemapUpper = undefined;
		const [lower, upper] = splitStyle(style);
		[basemapLower, basemapUpper] = await Promise.all([
			applyGroup(lower, Z_INDEX.basemap),
			applyGroup(upper, Z_INDEX.labels)
		]);
		map.addLayer(basemapLower);
		map.addLayer(basemapUpper);
		// The vector colours follow the theme, so the frames are rebuilt
		addOmFileLayers();
	});
};
