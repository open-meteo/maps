import { get } from 'svelte/store';

import { SvelteDate } from 'svelte/reactivity';

import { toast } from 'svelte-sonner';

import { mode } from 'mode-watcher';

import * as maplibregl from 'maplibre-gl';

import { pushState } from '$app/navigation';

import { pad } from '$lib/utils/pad';

import {
	time,
	model,
	loading,
	domain,
	variables,
	mapBounds,
	preferences as p
} from '$lib/stores/preferences';

import { domainOptions } from '$lib/utils/domains';
import { hideZero, variableOptions } from '$lib/utils/variables';
import { getColorScale } from '$lib/utils/color-scales';

import type { DomainMetaData } from '$lib/types';

import { getValueFromLatLong } from '../om-protocol';

const TILE_SIZE = Number(import.meta.env.VITE_TILE_SIZE);

const preferences = get(p);

const beforeLayer = 'waterway-tunnel';

const now = new SvelteDate();
now.setHours(now.getHours() + 1, 0, 0, 0);

let omUrl: string;

export const urlParamsToPreferences = (url: URL) => {
	const params = new URLSearchParams(url.search);

	const urlModelTime = params.get('model_run');
	if (urlModelTime && urlModelTime.length == 15) {
		const year = parseInt(urlModelTime.slice(0, 4));
		const month = parseInt(urlModelTime.slice(5, 7)) - 1;
		const day = parseInt(urlModelTime.slice(8, 10));
		const hour = parseInt(urlModelTime.slice(11, 13));
		const minute = parseInt(urlModelTime.slice(13, 15));
		// Parse Date from UTC components (urlTime is in UTC)
		model.set(new SvelteDate(Date.UTC(year, month, day, hour, minute, 0, 0)));
	} else {
		const m = get(model);
		m.setHours(0, 0, 0, 0);
		model.set(m);
	}

	const urlTime = params.get('time');
	if (urlTime && urlTime.length == 15) {
		const year = parseInt(urlTime.slice(0, 4));
		const month = parseInt(urlTime.slice(5, 7)) - 1;
		const day = parseInt(urlTime.slice(8, 10));
		const hour = parseInt(urlTime.slice(11, 13));
		const minute = parseInt(urlTime.slice(13, 15));
		// Parse Date from UTC components (urlTime is in UTC)
		time.set(new SvelteDate(Date.UTC(year, month, day, hour, minute, 0, 0)));
	}
	checkClosestHourDomainInterval(url);

	if (params.get('globe')) {
		preferences.globe = params.get('globe') === 'true';
	} else {
		if (preferences.globe) {
			url.searchParams.set('globe', String(preferences.globe));
		}
	}

	if (params.get('partial')) {
		preferences.partial = params.get('partial') === 'true';
	} else {
		if (preferences.partial) {
			url.searchParams.set('partial', String(preferences.partial));
		}
	}

	if (params.get('terrain')) {
		preferences.terrain = params.get('terrain') === 'true';
	} else {
		if (preferences.terrain) {
			url.searchParams.set('terrain', String(preferences.terrain));
		}
	}

	if (params.get('domain')) {
		domain.set(domainOptions.find((dm) => dm.value === params.get('domain')) ?? domainOptions[0]);
	}

	if (params.get('variables')) {
		variables.set([
			variableOptions.find((v) => v.value === params.get('variables')) ?? variableOptions[0]
		]);
	}

	if (params.get('hillshade')) {
		preferences.hillshade = params.get('hillshade') === 'true';
	} else {
		if (preferences.hillshade) {
			url.searchParams.set('hillshade', String(preferences.hillshade));
		}
	}

	if (params.get('time-selector')) {
		preferences.timeSelector = params.get('time-selector') === 'true';
	} else {
		if (!preferences.timeSelector) {
			url.searchParams.set('time-selector', String(preferences.timeSelector));
		}
	}

	p.set(preferences);
};

export const checkClosestHourDomainInterval = (url: URL) => {
	const t = get(time);
	const d = get(domain);
	if (d.time_interval > 1) {
		if (t.getUTCHours() % d.time_interval > 0) {
			const closestUTCHour = t.getUTCHours() - (t.getUTCHours() % d.time_interval);
			t.setUTCHours(closestUTCHour + d.time_interval);
			url.searchParams.set('time', t.toISOString().replace(/[:Z]/g, '').slice(0, 15));
		}
	}
	time.set(t);
};

export const checkClosestHourModelRun = (
	map: maplibregl.Map,
	url: URL,
	latest: DomainMetaData | undefined
) => {
	const t = get(time);
	const m = get(model);
	const d = get(domain);

	let modelRunChanged = false;
	const referenceTime = new Date(latest ? latest.reference_time : now);

	const year = t.getUTCFullYear();
	const month = t.getUTCMonth();
	const date = t.getUTCDate();

	const closestModelRunUTCHour = t.getUTCHours() - (t.getUTCHours() % d.model_interval);

	const closestModelRun = new SvelteDate();
	closestModelRun.setUTCFullYear(year);
	closestModelRun.setUTCMonth(month);
	closestModelRun.setUTCDate(date);
	closestModelRun.setUTCHours(closestModelRunUTCHour);
	closestModelRun.setUTCMinutes(0);
	closestModelRun.setUTCSeconds(0);
	closestModelRun.setUTCMilliseconds(0);

	if (t.getTime() < m.getTime()) {
		model.set(new SvelteDate(closestModelRun));
		modelRunChanged = true;
	} else {
		if (referenceTime.getTime() === m.getTime()) {
			url.searchParams.delete('model_run');
			pushState(url + map._hash.getHashString(), {});
		} else if (t.getTime() > referenceTime.getTime() && referenceTime.getTime() > m.getTime()) {
			model.set(new SvelteDate(referenceTime));
			modelRunChanged = true;
		} else if (t.getTime() < referenceTime.getTime() - 24 * 60 * 60 * 1000) {
			// Atleast yesterday, always update to nearest modelRun
			if (m.getTime() < closestModelRun.getTime()) {
				model.set(new SvelteDate(closestModelRun));
				modelRunChanged = true;
			}
		}
	}

	if (modelRunChanged) {
		url.searchParams.set('model_run', m.toISOString().replace(/[:Z]/g, '').slice(0, 15));
		pushState(url + map._hash.getHashString(), {});
		toast(
			'Model run set to: ' +
				m.getUTCFullYear() +
				'-' +
				pad(m.getUTCMonth() + 1) +
				'-' +
				pad(m.getUTCDate()) +
				' ' +
				pad(m.getUTCHours()) +
				':' +
				pad(m.getUTCMinutes())
		);
	}
	// day the data structure was altered
	if (m.getTime() < 1752624000000) {
		toast('Date selected probably too old, since data structure altered on 16th July 2025');
	}
};

export const setMapControlSettings = (map: maplibregl.Map, url: URL) => {
	map.touchZoomRotate.disableRotation();

	const navigationControl = new maplibregl.NavigationControl({
		visualizePitch: true,
		showZoom: true,
		showCompass: true
	});
	map.addControl(navigationControl);

	const locateControl = new maplibregl.GeolocateControl({
		fitBoundsOptions: {
			maxZoom: 13.5
		},
		positionOptions: {
			enableHighAccuracy: true
		},
		trackUserLocation: true
	});
	map.addControl(locateControl);

	const globeControl = new maplibregl.GlobeControl();
	map.addControl(globeControl);
	globeControl._globeButton.addEventListener('click', () => globeHandler(map, url));

	// improved scrolling
	map.scrollZoom.setZoomRate(1 / 85);
	map.scrollZoom.setWheelZoomRate(1 / 85);
};

export const addHillshadeLayer = (map: maplibregl.Map) => {
	map.setSky({
		'sky-color': '#000000',
		'sky-horizon-blend': 0.8,
		'horizon-color': '#80C1FF',
		'horizon-fog-blend': 0.6,
		'fog-color': '#D6EAFF',
		'fog-ground-blend': 0
	});

	map.addSource('terrainSource', {
		type: 'raster-dem',
		tiles: ['https://mapproxy.servert.nl/wmts/copernicus/webmercator/{z}/{x}/{y}.png'],
		tileSize: 512,
		// @ts-expect-error scheme not supported in types, but still works
		scheme: 'tms',
		maxzoom: 10
	});

	map.addSource('hillshadeSource', {
		type: 'raster-dem',
		tiles: ['https://mapproxy.servert.nl/wmts/copernicus/webmercator/{z}/{x}/{y}.png'],
		tileSize: 512,
		// @ts-expect-error scheme not supported in types, but still works
		scheme: 'tms',
		maxzoom: 10
	});

	map.addLayer(
		{
			source: 'hillshadeSource',
			id: 'hillshadeLayer',
			type: 'hillshade',
			paint: {
				'hillshade-method': 'igor',
				'hillshade-shadow-color': 'rgba(0,0,0,0.4)',
				'hillshade-highlight-color': 'rgba(255,255,255,0.35)'
			}
		},
		beforeLayer
	);
};

let omFileSource: maplibregl.RasterTileSource | undefined;

export const addOmFileLayer = (map: maplibregl.Map) => {
	omUrl = getOMUrl();
	map.addSource('omFileRasterSource', {
		url: 'om://' + omUrl,
		type: 'raster',
		tileSize: TILE_SIZE
	});

	omFileSource = map.getSource('omFileRasterSource');
	if (omFileSource) {
		omFileSource.on('error', (e) => {
			checked = 0;
			loading.set(false);
			clearInterval(checkSourceLoadedInterval);
			toast(e.error.message);
		});
	}

	map.addLayer(
		{
			id: 'omFileRasterLayer',
			type: 'raster',
			source: 'omFileRasterSource'
		},
		beforeLayer
	);
};

export const terrainHandler = (map: maplibregl.Map, url: URL) => {
	preferences.terrain = !preferences.terrain;
	p.set(preferences);
	if (preferences.terrain) {
		url.searchParams.set('terrain', String(preferences.terrain));
	} else {
		url.searchParams.delete('terrain');
	}
	pushState(url + map._hash.getHashString(), {});
};

export const globeHandler = (map: maplibregl.Map, url: URL) => {
	preferences.globe = !preferences.globe;
	p.set(preferences);
	if (preferences.globe) {
		url.searchParams.set('globe', String(preferences.globe));
	} else {
		url.searchParams.delete('globe');
	}
	pushState(url + map._hash.getHashString(), {});
};

let checked = 0;
let checkSourceLoadedInterval: ReturnType<typeof setInterval>;
export const changeOMfileURL = (
	map: maplibregl.Map,
	url: URL,
	latest: DomainMetaData | undefined
) => {
	if (map && omFileSource) {
		loading.set(true);
		if (popup) {
			popup.remove();
		}
		mapBounds.set(map.getBounds());

		checkClosestHourModelRun(map, url, latest);

		omUrl = getOMUrl();
		omFileSource.setUrl('om://' + omUrl);

		checkSourceLoadedInterval = setInterval(() => {
			checked++;
			if ((omFileSource && omFileSource.loaded()) || checked >= 200) {
				if (checked >= 200) {
					// Timeout after 10s
					toast('Request timed out');
				}
				checked = 0;
				loading.set(false);
				clearInterval(checkSourceLoadedInterval);
			}
		}, 50);
	}
};

export const getStyle = async () => {
	return await fetch(
		`https://maptiler.servert.nl/styles/minimal-world-maps${mode.current === 'dark' ? '-dark' : ''}/style.json`
	)
		.then((response) => response.json())
		.then((style) => {
			if (preferences.globe) {
				return {
					...style,
					projection: {
						type: 'globe'
					}
				};
			} else {
				return style;
			}
		});
};

let popup: maplibregl.Popup | undefined;
let showPopup = false;
export const addPopup = (map: maplibregl.Map) => {
	let variable = get(variables)[0];
	let colorScale = getColorScale(variable.value);

	map.on('mousemove', function (e) {
		if (showPopup) {
			const coordinates = e.lngLat;
			if (!popup) {
				popup = new maplibregl.Popup()
					.setLngLat(coordinates)
					.setHTML(`<span class="value-popup">Outside domain</span>`)
					.addTo(map);
			} else {
				popup.addTo(map);
			}
			const { index, value } = getValueFromLatLong(coordinates.lat, coordinates.lng, colorScale);
			if (index) {
				if ((hideZero.includes(variable.value) && value <= 0.25) || !value) {
					popup.remove();
				} else {
					const string = value.toFixed(1) + colorScale.unit;
					popup.setLngLat(coordinates).setHTML(`<span class="value-popup">${string}</span>`);
				}
			} else {
				popup.setLngLat(coordinates).setHTML(`<span class="value-popup">Outside domain</span>`);
			}
		}
	});

	map.on('click', (e: maplibregl.MapMouseEvent) => {
		variable = get(variables)[0];
		colorScale = getColorScale(get(variables)[0].value);

		showPopup = !showPopup;
		if (!showPopup && popup) {
			popup.remove();
		}
		if (showPopup && popup) {
			const coordinates = e.lngLat;
			popup.setLngLat(coordinates).addTo(map);
		}
	});
};

export const getOMUrl = () => {
	const mB = get(mapBounds);
	if (mB) {
		return `https://map-tiles.open-meteo.com/data_spatial/${get(domain).value}/${get(model).getUTCFullYear()}/${pad(get(model).getUTCMonth() + 1)}/${pad(get(model).getUTCDate())}/${pad(get(model).getUTCHours())}00Z/${get(time).getUTCFullYear()}-${pad(get(time).getUTCMonth() + 1)}-${pad(get(time).getUTCDate())}T${pad(get(time).getUTCHours())}00.om?dark=${mode.current === 'dark'}&variable=${get(variables)[0].value}&bounds=${mB.getSouth()},${mB.getWest()},${mB.getNorth()},${mB.getEast()}&partial=${preferences.partial}`;
	} else {
		return `https://map-tiles.open-meteo.com/data_spatial/${get(domain).value}/${get(model).getUTCFullYear()}/${pad(get(model).getUTCMonth() + 1)}/${pad(get(model).getUTCDate())}/${pad(get(model).getUTCHours())}00Z/${get(time).getUTCFullYear()}-${pad(get(time).getUTCMonth() + 1)}-${pad(get(time).getUTCDate())}T${pad(get(time).getUTCHours())}00.om?dark=${mode.current === 'dark'}&variable=${get(variables)[0].value}&partial=${preferences.partial}`;
	}
};
