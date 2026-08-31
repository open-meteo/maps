import { get } from 'svelte/store';

import {
	GridFactory,
	domainOptions,
	getFallbackDomain,
	omProtocol,
	sunProtocol,
	updateCurrentBounds
} from '@openmeteo/weather-map-layer';
import * as maplibregl from 'maplibre-gl';
import { mode } from 'mode-watcher';

import { map as m } from '$lib/stores/map';
import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
import { defaultPreferences, preferences as p } from '$lib/stores/preferences';
import { domain as d } from '$lib/stores/variables';

import { BEFORE_LAYER_RASTER, HILLSHADE_LAYER } from '$lib/constants';

import { addOmFileLayers } from './layers';
import { updateUrl } from './url';

import type { RequestParameters } from 'maplibre-gl';

export const createMap = async (container: HTMLElement) => {
	maplibregl.addProtocol('om', (params: RequestParameters, abortController: AbortController) =>
		omProtocol(params, abortController, get(omProtocolSettings))
	);
	maplibregl.addProtocol('sun', sunProtocol);

	const style = await getStyle();

	const domainObject = domainOptions.find(({ value }) => value === get(d));
	if (!domainObject) {
		throw new Error('Domain not found');
	}
	// For seamless domains, use the global (last) backing domain for initial map position
	const gridDomain = getFallbackDomain(domainObject, domainOptions);
	if (!gridDomain) {
		throw new Error('Backing domain not found');
	}
	const grid = GridFactory.create(gridDomain.grid);

	const map = new maplibregl.Map({
		container,
		style,
		center: grid.getCenter(),
		zoom: gridDomain.grid.zoom,
		keyboard: false,
		hash: true,
		maxPitch: 85
	});
	m.set(map);

	setMapControlSettings();

	// update bounds when new tiles are requested, to trigger new data ranges loading if necessary
	map.on('dataloading', () => {
		const bounds = map.getBounds();
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
		new maplibregl.NavigationControl({ visualizePitch: true, showZoom: true, showCompass: true })
	);
	map.addControl(
		new maplibregl.GeolocateControl({
			fitBoundsOptions: { maxZoom: 13.5 },
			positionOptions: { enableHighAccuracy: true },
			trackUserLocation: true
		})
	);

	const globeControl = new maplibregl.GlobeControl();
	map.addControl(globeControl);
	globeControl._globeButton.addEventListener('click', () => globeHandler());

	map.scrollZoom.setZoomRate(1 / 85);
	map.scrollZoom.setWheelZoomRate(1 / 85);
};

export const addTerrainSource = (map: maplibregl.Map, name: string = 'terrainSource') => {
	map.setSky({
		'sky-color': '#000000',
		'sky-horizon-blend': 0.8,
		'horizon-color': '#80C1FF',
		'horizon-fog-blend': 0.6,
		'fog-color': '#D6EAFF',
		'fog-ground-blend': 0
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
				'hillshade-method': 'igor',
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
	const style = await fetch(
		`https://static-assets.open-meteo.com/map-assets/styles/minimal-planet-maps${appliedStyleMode === 'dark' ? '-dark' : ''}${preferences.clipWater ? '-water-clip' : ''}.json`
	).then((r) => r.json());

	return preferences.globe ? { ...style, projection: { type: 'globe' } } : style;
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
				if (preferences.hillshade) {
					addHillshadeLayer();
				}
				addOmFileLayers();
			}, 50);
		});
	});
};
