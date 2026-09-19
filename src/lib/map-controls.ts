import { get } from 'svelte/store';

import '@maplibre/maplibre-gl-leaflet';
import {
	type Domain,
	GridFactory,
	domainOptions,
	updateCurrentBounds
} from '@openmeteo/weather-map-layer';
import L from 'leaflet';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { mode } from 'mode-watcher';

import { map as m } from '$lib/stores/map';
import { preferences as p } from '$lib/stores/preferences';
import { domain as d } from '$lib/stores/variables';

import { LocateButton } from '$lib/components/buttons';

import { BEFORE_LAYER_RASTER } from '$lib/constants';

import { addOmFileLayers } from './layers';
import { registerOmProtocol } from './om-adapter';

import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

/**
 * Leaflet stacks layers by pane. The basemap is one MapLibre style rendered
 * by two maplibre-gl-leaflet instances: everything below the raster insertion
 * point of the MapLibre app goes under the weather, everything from there on
 * (boundaries, roads, labels) is drawn on top of it, so the weather sits
 * under the labels exactly as in the MapLibre app.
 */
export const BASEMAP_PANE = 'basemap';
export const RASTER_PANE = 'weather-raster';
export const VECTOR_PANE = 'weather-vector';
export const LABELS_PANE = 'basemap-labels';

const PANE_Z_INDEX: Record<string, number> = {
	[BASEMAP_PANE]: 150,
	[RASTER_PANE]: 210,
	[VECTOR_PANE]: 220,
	[LABELS_PANE]: 230
};

let basemapLower: L.MaplibreGL | undefined;
let basemapUpper: L.MaplibreGL | undefined;

/** The MapLibre `#zoom/lat/lng` hash Leaflet does not maintain itself. */
export const getHashString = (): string => {
	const map = get(m);
	if (!map) return '';
	const center = map.getCenter();
	const zoom = Math.round(map.getZoom() * 100) / 100;
	// Enough decimals for one pixel at this zoom (MapLibre's rule)
	const precision = Math.max(
		0,
		Math.ceil((zoom * Math.LN2 + Math.log(512 / 360 / 0.5)) / Math.LN10)
	);
	return `#${zoom}/${center.lat.toFixed(precision)}/${center.lng.toFixed(precision)}`;
};

const parseHash = (): { center: L.LatLngExpression; zoom: number } | undefined => {
	const parts = window.location.hash.replace('#', '').split('/');
	if (parts.length < 3) return undefined;
	const [zoom, lat, lng] = parts.map(Number);
	if (![zoom, lat, lng].every(Number.isFinite)) return undefined;
	return { center: [lat, lng], zoom };
};

const writeHash = (): void => {
	const hash = getHashString();
	if (!hash) return;
	window.history.replaceState(window.history.state, '', location.href.replace(/(#.+)?$/, hash));
};

export const createMap = async (container: HTMLElement) => {
	// MapLibre 6 loads its worker from a URL relative to its own module, which a
	// bundled app cannot serve (404, blank basemap). Use the worker bundled by
	// Vite; the plugin's MapLibre is the same module instance.
	maplibregl.setWorkerUrl(maplibreWorkerUrl);

	registerOmProtocol();

	const domainObject = domainOptions.find(({ value }: Domain) => value === get(d));
	if (!domainObject) {
		throw new Error('Domain not found');
	}
	const grid = GridFactory.create(domainObject.grid);
	const { lng, lat } = grid.getCenter();
	const hash = parseHash();

	const map = L.map(container, {
		center: hash?.center ?? [lat, lng],
		zoom: hash?.zoom ?? domainObject.grid.zoom,
		keyboard: false,
		// Fractional zooms like the MapLibre app; the buttons still step by one
		zoomSnap: 0,
		zoomDelta: 1,
		// About the MapLibre app's wheel zoom rate
		wheelPxPerZoomLevel: 120,
		worldCopyJump: false,
		// Both re-added below: the zoom buttons on the right like the MapLibre
		// app, the attribution without Leaflet's prefix
		zoomControl: false,
		attributionControl: false
	});
	L.control.zoom({ position: 'topright' }).addTo(map);
	L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(map);

	for (const [pane, zIndex] of Object.entries(PANE_Z_INDEX)) {
		map.createPane(pane).style.zIndex = String(zIndex);
	}
	m.set(map);

	await addBasemap(map);
	setMapControlSettings();

	map.on('moveend', writeHash);
	// update bounds when the view changes, to trigger new data ranges loading if necessary
	const syncBounds = () => {
		const bounds = map.getBounds();
		updateCurrentBounds([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]);
	};
	map.on('moveend', syncBounds);
	syncBounds();

	return map;
};

/** Run `callback` once the map is ready for layers (Leaflet: after the first view). */
export const whenMapReady = (map: L.Map, callback: () => void): void => {
	map.whenReady(callback);
};

export const setMapControlSettings = () => {
	const map = get(m);
	if (!map) return;

	// Leaflet has no geolocate control; the button wraps `map.locate`
	map.addControl(new LocateButton());
};

// Mode the currently applied basemap style was fetched for. Can drift from
// mode.current: when an embedding page's color-scheme propagates into our
// prefers-color-scheme, mode-watcher flips the UI mode without any style
// reload happening.
let appliedStyleMode: 'light' | 'dark' = 'light';

export const getAppliedStyleMode = () => appliedStyleMode;

export const getStyle = async (): Promise<StyleSpecification> => {
	const preferences = get(p);
	appliedStyleMode = mode.current === 'dark' ? 'dark' : 'light';
	return fetch(
		`https://static-assets.open-meteo.com/map-assets/styles/minimal-planet-maps${appliedStyleMode === 'dark' ? '-dark' : ''}${preferences.clipWater ? '-water-clip' : ''}.json`
	).then((r) => r.json());
};

/** The style split at the raster insertion point: [below the weather, above it]. */
const splitStyle = (style: StyleSpecification): [StyleSpecification, StyleSpecification] => {
	const at = style.layers.findIndex(
		(layer: LayerSpecification) => layer.id === BEFORE_LAYER_RASTER
	);
	const cut = at === -1 ? style.layers.length : at;
	return [
		{ ...style, layers: style.layers.slice(0, cut) },
		// The upper instance must stay see-through
		{ ...style, layers: style.layers.slice(cut).filter((layer) => layer.type !== 'background') }
	];
};

const addBasemap = async (map: L.Map): Promise<void> => {
	const [lower, upper] = splitStyle(await getStyle());
	const options = (style: StyleSpecification, pane: string) =>
		({
			style,
			pane,
			interactive: false,
			attributionControl: false
		}) as unknown as L.LeafletMaplibreGLOptions;
	basemapLower = L.maplibreGL(options(lower, BASEMAP_PANE)).addTo(map);
	basemapUpper = L.maplibreGL(options(upper, LABELS_PANE)).addTo(map);
	// The style's attribution is what MapLibre would show
	map.attributionControl.addAttribution(
		'<a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>'
	);
};

export const reloadStyles = () => {
	getStyle().then((style) => {
		const map = get(m);
		if (!map || !basemapLower || !basemapUpper) return;
		const [lower, upper] = splitStyle(style);
		basemapLower.getMaplibreMap().setStyle(lower);
		basemapUpper.getMaplibreMap().setStyle(upper);
		// The vector colours follow the theme, so the frames are rebuilt
		addOmFileLayers();
	});
};
