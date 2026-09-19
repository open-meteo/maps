import { get } from 'svelte/store';

import {
	type Domain,
	GridFactory,
	domainOptions,
	updateCurrentBounds
} from '@openmeteo/weather-map-layer';
import mapboxgl from 'mapbox-gl';
import { mode } from 'mode-watcher';

import { map as m } from '$lib/stores/map';
import { defaultPreferences, preferences as p } from '$lib/stores/preferences';
import { domain as d } from '$lib/stores/variables';

import { GlobeButton } from '$lib/components/buttons';

import { BEFORE_LAYER_RASTER, HILLSHADE_LAYER } from '$lib/constants';

import { addOmFileLayers } from './layers';
import { registerOmProtocol } from './om-adapter';
import { updateUrl } from './url';

export const createMap = async (container: HTMLElement) => {
	// Mapbox GL renders nothing without a token, even for a self-hosted style.
	// The placeholder (as in the weather-map-layer examples) keeps the branch
	// runnable without configuration; it only breaks telemetry and
	// mapbox:// resources, which this app does not use.
	const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined;
	if (!accessToken) {
		console.warn('No VITE_MAPBOX_ACCESS_TOKEN in .env: running Mapbox GL with a placeholder token');
	}
	mapboxgl.accessToken = accessToken || 'XXX';

	registerOmProtocol();

	const style = await getStyle();

	const domainObject = domainOptions.find(({ value }: Domain) => value === get(d));
	if (!domainObject) {
		throw new Error('Domain not found');
	}
	const grid = GridFactory.create(domainObject.grid);

	const map = new mapboxgl.Map({
		container,
		style,
		center: grid.getCenter(),
		zoom: domainObject.grid.zoom,
		keyboard: false,
		hash: true,
		maxPitch: 85,
		projection: get(p).globe ? 'globe' : 'mercator'
	});
	m.set(map);

	setMapControlSettings();

	// update bounds when new tiles are requested, to trigger new data ranges loading if necessary
	map.on('dataloading', () => {
		const bounds = map.getBounds();
		if (!bounds) return;
		const [minLng, minLat] = bounds.getSouthWest().toArray();
		const [maxLng, maxLat] = bounds.getNorthEast().toArray();
		updateCurrentBounds([minLng, minLat, maxLng, maxLat]);
	});

	return map;
};

export const setMapControlSettings = () => {
	const map = get(m);
	if (!map) return;

	map.touchZoomRotate.disableRotation();
	map.addControl(
		new mapboxgl.NavigationControl({ visualizePitch: true, showZoom: true, showCompass: true })
	);
	map.addControl(
		new mapboxgl.GeolocateControl({
			fitBoundsOptions: { maxZoom: 13.5 },
			positionOptions: { enableHighAccuracy: true },
			trackUserLocation: true
		})
	);

	// Mapbox ships no globe control; the button toggles the projection itself
	map.addControl(new GlobeButton());

	map.scrollZoom.setZoomRate(1 / 85);
	map.scrollZoom.setWheelZoomRate(1 / 85);
};

export const addTerrainSource = (map: mapboxgl.Map, name: string = 'terrainSource') => {
	// The atmosphere is what MapLibre's sky settings draw with terrain on
	map.setFog({
		color: '#D6EAFF',
		'high-color': '#80C1FF',
		'horizon-blend': 0.1,
		'space-color': '#000000',
		'star-intensity': 0
	});

	map.addSource(name, {
		type: 'raster-dem',
		url: 'https://tiles.mapterhorn.com/tilejson.json'
	});
};

export const addHillshadeLayer = () => {
	const map = get(m);
	if (!map) return;

	map.addLayer(
		{
			source: 'terrainSource',
			id: HILLSHADE_LAYER,
			type: 'hillshade',
			paint: {
				'hillshade-shadow-color': 'rgba(0,0,0,0.4)',
				'hillshade-highlight-color': 'rgba(255,255,255,0.35)'
			}
		},
		BEFORE_LAYER_RASTER
	);
};

// Mode the currently applied basemap style was fetched for. Can drift from
// mode.current: when an embedding page's color-scheme propagates into our
// prefers-color-scheme, mode-watcher flips the UI mode without any style
// reload happening.
let appliedStyleMode: 'light' | 'dark' = 'light';

export const getAppliedStyleMode = () => appliedStyleMode;

export const getStyle = async () => {
	const preferences = get(p);
	appliedStyleMode = mode.current === 'dark' ? 'dark' : 'light';
	// The projection is not part of the style: Mapbox validates the style
	// object and knows the projection from the map options / setProjection
	const style: mapboxgl.StyleSpecification = await fetch(
		`https://static-assets.open-meteo.com/map-assets/styles/minimal-planet-maps${appliedStyleMode === 'dark' ? '-dark' : ''}${preferences.clipWater ? '-water-clip' : ''}.json`
	).then((r) => r.json());

	return style;
};

export const terrainHandler = () => {
	const preferences = get(p);
	preferences.terrain = !preferences.terrain;
	p.set(preferences);
	updateUrl('terrain', String(preferences.terrain), String(defaultPreferences.terrain));
};

export const globeHandler = () => {
	const preferences = get(p);
	preferences.globe = !preferences.globe;
	p.set(preferences);
	get(m)?.setProjection(preferences.globe ? 'globe' : 'mercator');
	updateUrl('globe', String(preferences.globe), String(defaultPreferences.globe));
};

export const reloadStyles = () => {
	getStyle().then((style) => {
		const map = get(m);
		if (!map) return;
		map.setStyle(style);
		map.once('styledata', () => {
			setTimeout(() => {
				addTerrainSource(map);
				const preferences = get(p);
				// A style without a projection resets the map to mercator
				map.setProjection(preferences.globe ? 'globe' : 'mercator');
				if (preferences.hillshade) {
					addHillshadeLayer();
				}
				addOmFileLayers();
			}, 50);
		});
	});
};
