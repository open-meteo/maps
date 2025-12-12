import { SvelteDate } from 'svelte/reactivity';
import { get } from 'svelte/store';

import {
	GridFactory,
	closestModelRun,
	domainOptions,
	domainStep,
	getColor,
	getColorScale,
	getValueFromLatLong
} from '@openmeteo/mapbox-layer';
import * as maplibregl from 'maplibre-gl';
import { mode } from 'mode-watcher';
import { toast } from 'svelte-sonner';

import { browser } from '$app/environment';
import { pushState } from '$app/navigation';

import {
	domain as d,
	loading,
	mapBounds as mB,
	modelRun as mR,
	preferences as p,
	paddedBounds as pB,
	paddedBoundsSource as pBS,
	paddedBoundsGeoJSON,
	paddedBoundsLayer,
	resolution as r,
	tileSize as tS,
	time,
	variable as v,
	vectorOptions as vO,
	variableSelectionExtended
} from '$lib/stores/preferences';

import type { Domain, DomainMetaData, ModelDt } from '@openmeteo/mapbox-layer';

let preferences = get(p);
p.subscribe((newPreferences) => {
	preferences = newPreferences;
});
let vectorOptions = get(vO);
vO.subscribe((newVectorOptions) => {
	vectorOptions = newVectorOptions;
});

const beforeLayerRaster = 'waterway-tunnel';
const beforeLayerVector = 'place_label_other';
const beforeLayerVectorWaterClip = 'water-clip';

const now = new SvelteDate();
now.setHours(now.getHours() + 1, 0, 0, 0);

let omUrl: string;

export const pad = (n: string | number) => {
	return ('0' + n).slice(-2);
};

export const urlParamsToPreferences = (url: URL) => {
	const params = new URLSearchParams(url.search);

	const urlModelTime = params.get('model-run');
	if (urlModelTime && urlModelTime.length == 15) {
		const year = parseInt(urlModelTime.slice(0, 4));
		const month = parseInt(urlModelTime.slice(5, 7)) - 1;
		const day = parseInt(urlModelTime.slice(8, 10));
		const hour = parseInt(urlModelTime.slice(11, 13));
		const minute = parseInt(urlModelTime.slice(13, 15));
		// Parse Date from UTC components (urlTime is in UTC)
		mR.set(new SvelteDate(Date.UTC(year, month, day, hour, minute, 0, 0)));
	} else {
		const modelRun = get(mR);
		modelRun.setUTCHours(0, 0, 0, 0);
		mR.set(modelRun);
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
	checkClosestDomainInterval(url);

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

	const domain = params.get('domain');
	if (domain) {
		d.set(domain);
	} else {
		if (get(d) !== 'dwd_icon') {
			url.searchParams.set('domain', get(d));
		}
	}

	const variable = params.get('variable');
	if (variable) {
		v.set(variable);
	} else {
		if (get(v) !== 'temperature_2m') {
			url.searchParams.set('variable', get(v));
		}
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

	if (params.get('clip-water')) {
		preferences.clipWater = params.get('clip-water') === 'true';
	} else {
		if (preferences.clipWater) {
			url.searchParams.set('clip-water', String(preferences.clipWater));
		}
	}

	if (params.get('arrows')) {
		vectorOptions.arrows = params.get('arrows') === 'true';
	} else {
		if (!vectorOptions.arrows) {
			url.searchParams.set('arrows', String(vectorOptions.arrows));
		}
	}

	if (params.get('contours')) {
		vectorOptions.contours = params.get('contours') === 'true';
	} else {
		if (vectorOptions.contours) {
			url.searchParams.set('contours', String(vectorOptions.contours));
		}
	}

	if (params.get('interval')) {
		vectorOptions.contourInterval = Number(params.get('interval'));
	} else {
		if (vectorOptions.contourInterval !== 2) {
			url.searchParams.set('interval', String(vectorOptions.contourInterval));
		}
	}

	vO.set(vectorOptions);

	if (params.get('variables-open')) {
		variableSelectionExtended.set(true);
	}

	p.set(preferences);
};

/** "YYYY-MM-DDTHHMM" */
export const fmtISOWithoutTimezone = (d: Date) => d.toISOString().replace(/[:Z]/g, '').slice(0, 15);

export const checkClosestDomainInterval = (url: URL) => {
	const original = get(time);
	const t = new Date(original.getTime());
	const domain = domainOptions.find(({ value }) => value === get(d));
	if (domain) {
		const closestTime = domainStep(t, domain.time_interval, 'floor');
		url.searchParams.set('time', fmtISOWithoutTimezone(closestTime));
		time.set(closestTime);
	}
};

export const checkClosestModelRun = (
	map: maplibregl.Map,
	url: URL,
	latest: DomainMetaData | undefined
) => {
	const domain = domainOptions.find(({ value }) => value === get(d));
	if (!domain) {
		throw new Error('Domain not found');
	}
	let timeStep = get(time);

	// other than seasonal models, data is not available longer than 7 days
	if (domain.model_interval !== 'monthly') {
		// check that requested timeStep is not older than 7 days
		const _7daysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
		if (timeStep.getTime() < _7daysAgo) {
			toast.warning('Date selected too old, using 7 days ago time');
			const nowTimeStep = domainStep(new Date(_7daysAgo), domain.time_interval, 'floor');
			time.set(nowTimeStep);
			timeStep = nowTimeStep;
		}
	}
	// check that requested time is not newer than the latest valid_times in the DomainMetaData
	if (latest) {
		const latestTimeStep = new Date(latest.valid_times[latest.valid_times.length - 1]);
		if (timeStep.getTime() > latestTimeStep.getTime()) {
			toast.warning('Date selected too new, using latest available time');
			time.set(latestTimeStep);
			timeStep = latestTimeStep;
		}
	}

	const nearestModelRun = closestModelRun(timeStep, domain.model_interval);
	const modelRun = get(mR);

	let setToModelRun = new SvelteDate(modelRun);

	const latestReferenceTime = latest?.reference_time ? new Date(latest.reference_time) : undefined;

	if (latestReferenceTime && nearestModelRun.getTime() > latestReferenceTime.getTime()) {
		setToModelRun = new SvelteDate(latestReferenceTime);
	} else if (timeStep.getTime() < modelRun.getTime()) {
		setToModelRun = new SvelteDate(nearestModelRun);
	} else {
		if (latestReferenceTime) {
			if (latestReferenceTime.getTime() === modelRun.getTime()) {
				url.searchParams.delete('model-run');
				pushState(url + map._hash.getHashString(), {});
			} else if (
				timeStep.getTime() > latestReferenceTime.getTime() &&
				latestReferenceTime.getTime() > modelRun.getTime()
			) {
				setToModelRun = new SvelteDate(latestReferenceTime);
			} else if (timeStep.getTime() < latestReferenceTime.getTime() - 24 * 60 * 60 * 1000) {
				// Atleast yesterday, always update to nearest modelRun
				if (modelRun.getTime() < nearestModelRun.getTime()) {
					setToModelRun = new SvelteDate(nearestModelRun);
				}
			}
		}
	}

	if (setToModelRun.getTime() !== modelRun.getTime()) {
		mR.set(setToModelRun);
		url.searchParams.set('model-run', fmtISOWithoutTimezone(setToModelRun));
		pushState(url + map._hash.getHashString(), {});
		toast.info('Model run set to: ' + fmtISOWithoutTimezone(setToModelRun));
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

export const addHillshadeSources = (map: maplibregl.Map) => {
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
		tiles: ['mapterhorn://{z}/{x}/{y}'],
		encoding: 'terrarium',
		tileSize: 512,
		attribution: '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>'
	});
};

export const addHillshadeLayer = (map: maplibregl.Map) => {
	map.addLayer(
		{
			source: 'terrainSource',
			id: 'hillshadeLayer',
			type: 'hillshade',
			paint: {
				'hillshade-method': 'igor',
				'hillshade-shadow-color': 'rgba(0,0,0,0.4)',
				'hillshade-highlight-color': 'rgba(255,255,255,0.35)'
			}
		},
		beforeLayerRaster
	);
};

function isHighDensity() {
	return (
		(window.matchMedia &&
			(window.matchMedia(
				'only screen and (min-resolution: 124dpi), only screen and (min-resolution: 1.3dppx), only screen and (min-resolution: 48.8dpcm)'
			).matches ||
				window.matchMedia(
					'only screen and (-webkit-min-device-pixel-ratio: 1.3), only screen and (-o-min-device-pixel-ratio: 2.6/2), only screen and (min--moz-device-pixel-ratio: 1.3), only screen and (min-device-pixel-ratio: 1.3)'
				).matches)) ||
		(window.devicePixelRatio && window.devicePixelRatio > 1.3)
	);
}

function isRetina() {
	return (
		((window.matchMedia &&
			(window.matchMedia(
				'only screen and (min-resolution: 192dpi), only screen and (min-resolution: 2dppx), only screen and (min-resolution: 75.6dpcm)'
			).matches ||
				window.matchMedia(
					'only screen and (-webkit-min-device-pixel-ratio: 2), only screen and (-o-min-device-pixel-ratio: 2/1), only screen and (min--moz-device-pixel-ratio: 2), only screen and (min-device-pixel-ratio: 2)'
				).matches)) ||
			(window.devicePixelRatio && window.devicePixelRatio >= 2)) &&
		/(iPad|iPhone|iPod)/g.test(navigator.userAgent)
	);
}

export const checkHighDefinition = () => {
	if (browser) {
		return isRetina() || isHighDensity();
	} else {
		return false;
	}
};

let omRasterSource: maplibregl.RasterTileSource | undefined;
export const addOmFileLayers = (map: maplibregl.Map) => {
	omUrl = getOMUrl();
	map.addSource('omRasterSource', {
		url: 'om://' + omUrl,
		type: 'raster',
		tileSize: 256,
		maxzoom: 14
	});

	omRasterSource = map.getSource('omRasterSource');
	if (omRasterSource) {
		omRasterSource.on('error', (e) => {
			checked = 0;
			loading.set(false);
			clearInterval(checkSourceLoadedInterval);
			toast.error(e.error.message);
		});
	}

	map.addLayer(
		{
			id: 'omRasterLayer',
			type: 'raster',
			source: 'omRasterSource'
		},
		beforeLayerRaster
	);

	if (vectorOptions.contours || vectorOptions.arrows) {
		addVectorLayer(map);
	}
};

let omVectorSource: maplibregl.VectorTileSource | undefined;
export const addVectorLayer = (map: maplibregl.Map) => {
	if (!map.getSource('omVectorSource')) {
		map.addSource('omVectorSource', {
			url: 'om://' + omUrl,
			type: 'vector'
		});
		omVectorSource = map.getSource('omVectorSource');
		if (omVectorSource) {
			omVectorSource.on('error', (e) => {
				toast.error(e.error.message);
			});
		}
	}

	if (!map.getLayer('omVectorContourLayer')) {
		map.addLayer(
			{
				id: 'omVectorContourLayer',
				type: 'line',
				source: 'omVectorSource',
				'source-layer': 'contours',
				paint: {
					'line-color': [
						'case',
						['boolean', ['==', ['%', ['to-number', ['get', 'value']], 100], 0], false],
						'rgba(0,0,0,0.5)',
						[
							'case',
							['boolean', ['==', ['%', ['to-number', ['get', 'value']], 50], 0], false],
							'rgba(0,0,0,0.4)',
							[
								'case',
								['boolean', ['==', ['%', ['to-number', ['get', 'value']], 10], 0], false],
								'rgba(0,0,0,0.35)',
								'rgba(0,0,0,0.3)'
							]
						]
					],
					'line-width': [
						'case',
						['boolean', ['==', ['%', ['to-number', ['get', 'value']], 100], 0], false],
						3,
						[
							'case',
							['boolean', ['==', ['%', ['to-number', ['get', 'value']], 50], 0], false],
							2.5,
							[
								'case',
								['boolean', ['==', ['%', ['to-number', ['get', 'value']], 10], 0], false],
								2,
								1
							]
						]
					]
				}
			},
			preferences.clipWater ? beforeLayerVectorWaterClip : beforeLayerVector
		);
	}

	if (!map.getLayer('omVectorArrowLayer')) {
		map.addLayer(
			{
				id: 'omVectorArrowLayer',
				type: 'line',
				source: 'omVectorSource',
				'source-layer': 'wind-arrows',
				paint: {
					'line-color': [
						'case',
						['boolean', ['>', ['to-number', ['get', 'value']], 5], false],
						'rgba(0,0,0, 0.6)',
						[
							'case',
							['boolean', ['>', ['to-number', ['get', 'value']], 4], false],
							'rgba(0,0,0, 0.5)',
							[
								'case',
								['boolean', ['>', ['to-number', ['get', 'value']], 3], false],
								'rgba(0,0,0, 0.4)',
								[
									'case',
									['boolean', ['>', ['to-number', ['get', 'value']], 2], false],
									'rgba(0,0,0, 0.3)',
									'rgba(0,0,0, 0.2)'
								]
							]
						]
					],
					'line-width': 2
				},
				layout: {
					'line-cap': 'round'
				}
			},
			preferences.clipWater ? beforeLayerVectorWaterClip : beforeLayerVector
		);
	}

	if (!map.getLayer('omVectorGridLayer')) {
		map.addLayer(
			{
				id: 'omVectorGridLayer',
				type: 'circle',
				source: 'omVectorSource',
				'source-layer': 'grid',
				paint: {
					'circle-radius': [
						'interpolate',
						['exponential', 1.5],
						['zoom'],
						// zoom is 0 -> circle radius will be 1px
						0,
						0.1,
						// zoom is 12 (or greater) -> circle radius will be 20px
						12,
						10
					],
					'circle-color': 'orange'
				}
			},
			preferences.clipWater ? beforeLayerVectorWaterClip : beforeLayerVector
		);
	}

	if (!map.getLayer('omVectorContourLayerLabels')) {
		map.addLayer(
			{
				id: 'omVectorContourLayerLabels',
				type: 'symbol',
				source: 'omVectorSource',
				'source-layer': 'contours',
				layout: {
					'symbol-placement': 'line-center',
					'symbol-spacing': 1,
					'text-font': ['Noto Sans Regular'],
					'text-field': ['to-string', ['get', 'value']],
					'text-padding': 1,
					'text-offset': [0, -0.6]
				},
				paint: {
					'text-color': 'rgba(0,0,0,0.7)'
				}
			},
			preferences.clipWater ? beforeLayerVectorWaterClip : beforeLayerVector
		);
	}
};

export const removeVectorLayer = (map: maplibregl.Map) => {
	if (!vectorOptions.grid) {
		if (map.getLayer('omVectorGridLayer')) {
			map.removeLayer('omVectorGridLayer');
		}
	}
	if (!vectorOptions.arrows) {
		if (map.getLayer('omVectorArrowLayer')) {
			map.removeLayer('omVectorArrowLayer');
		}
	}
	if (!vectorOptions.contours) {
		if (map.getLayer('omVectorContourLayerLabels')) {
			map.removeLayer('omVectorContourLayerLabels');
		}
		if (map.getLayer('omVectorContourLayer')) {
			map.removeLayer('omVectorContourLayer');
		}
	}
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
	latest?: DomainMetaData | undefined,
	resetBounds = true,
	vectorOnly = false,
	rasterOnly = false
) => {
	if (map && omRasterSource) {
		// needs more testing
		// if (map.style.tileManagers.omRasterSource) {
		// 	const tileManager = map.style.tileManagers.omRasterSource;
		// 	if (tileManager._tiles) {
		// 		for (const tileId in tileManager._tiles) {
		// 			const tile = tileManager._tiles[tileId];
		// 			tile.unloadVectorData();
		// 		}
		// 		tileManager._tiles = {};
		// 	}
		// 	tileManager._cache.reset();
		// 	// tileManager.update(map.transform);
		// 	// map.triggerRepaint();
		// }

		loading.set(true);
		if (popup) {
			popup.remove();
		}
		mB.set(map.getBounds());
		if (resetBounds) {
			pB.set(map.getBounds());
		}
		getPaddedBounds(map);

		checkClosestModelRun(map, url, latest);

		omUrl = getOMUrl();
		if (!vectorOnly) {
			omRasterSource.setUrl('om://' + omUrl);
		}

		omVectorSource = map.getSource('omVectorSource');
		if (!rasterOnly && omVectorSource) {
			omVectorSource.setUrl('om://' + omUrl);
		}

		checkSourceLoadedInterval = setInterval(() => {
			checked++;
			if ((omRasterSource && omRasterSource.loaded()) || checked >= 200) {
				if (checked >= 200) {
					// Timeout after 10s
					toast.error('Request timed out');
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
		`https://maptiler.servert.nl/styles/minimal-world-maps${mode.current === 'dark' ? '-dark' : ''}${preferences.clipWater ? '-water-clip' : ''}/style.json`
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

export const textWhite = (
	[r, g, b, a]: [number, number, number, number] | [number, number, number],
	dark?: boolean
): boolean => {
	if (a != undefined && a < 0.65 && !dark) {
		return false;
	}
	// check luminance
	return r * 0.299 + g * 0.587 + b * 0.114 <= 186;
};

let popup: maplibregl.Popup | undefined;
let showPopup = false;
export const addPopup = (map: maplibregl.Map) => {
	const updatePopup = (e: maplibregl.MapMouseEvent) => {
		if (showPopup) {
			const coordinates = e.lngLat;
			if (!popup) {
				popup = new maplibregl.Popup({ closeButton: false })
					.setLngLat(coordinates)
					.setHTML(`<span class="value-popup">Outside domain</span>`)
					.addTo(map);
			} else {
				popup.addTo(map);
			}
			const { value } = getValueFromLatLong(
				coordinates.lat,
				coordinates.lng,
				omRasterSource?.url || ''
			);

			if (isFinite(value)) {
				const dark = mode.current === 'dark';
				const colorScale = getColorScale(get(v), dark);
				const color = getColor(colorScale, value);
				const content =
					'<span class="popup-value">' + value.toFixed(1) + '</span>' + colorScale.unit;
				popup
					.setLngLat(coordinates)
					.setHTML(
						`<div style="font-weight: bold; background-color: rgba(${color.join(',')}); color: ${textWhite(color, dark) ? 'white' : 'black'};" class="popup-div">${content}</div>`
					);
			} else {
				popup
					.setLngLat(coordinates)
					.setHTML(`<span style="padding: 3px 5px;" class="popup-string">Outside domain</span>`);
			}
		}
	};

	map.on('mousemove', updatePopup);
	map.on('click', (e: maplibregl.MapMouseEvent) => {
		showPopup = !showPopup;
		if (!showPopup && popup) {
			popup.remove();
		}
		if (showPopup && popup) {
			const coordinates = e.lngLat;
			popup.setLngLat(coordinates).addTo(map);
		}
		updatePopup(e);
	});
};

const padding = 25; //%
export const checkBounds = (map: maplibregl.Map, url: URL, latest: DomainMetaData | undefined) => {
	const domain = get(d);
	const domainObject = domainOptions.find(({ value }) => value === domain);

	const geojson = get(paddedBoundsGeoJSON);
	const paddedBounds = get(pB);
	const mapBounds = map.getBounds();
	const paddedBoundsSource = get(pBS);

	mB.set(mapBounds);

	if (domainObject && paddedBounds && preferences.partial) {
		let exceededPadding = false;

		if (geojson) {
			// @ts-expect-error stupid conflicting types from geojson
			geojson.features[0].geometry.coordinates = [
				[paddedBounds?.getSouthWest()['lng'], paddedBounds?.getSouthWest()['lat']],
				[paddedBounds?.getNorthWest()['lng'], paddedBounds?.getNorthWest()['lat']],
				[paddedBounds?.getNorthEast()['lng'], paddedBounds?.getNorthEast()['lat']],
				[paddedBounds?.getSouthEast()['lng'], paddedBounds?.getSouthEast()['lat']],
				[paddedBounds?.getSouthWest()['lng'], paddedBounds?.getSouthWest()['lat']]
			];
			paddedBoundsSource?.setData(geojson);
		}

		const gridBounds = GridFactory.create(domainObject.grid).getBounds();

		if (mapBounds.getSouth() < paddedBounds.getSouth() && paddedBounds.getSouth() > gridBounds[1]) {
			exceededPadding = true;
		}
		if (mapBounds.getWest() < paddedBounds.getWest() && paddedBounds.getWest() > gridBounds[0]) {
			exceededPadding = true;
		}
		if (mapBounds.getNorth() > paddedBounds.getNorth() && paddedBounds.getNorth() < gridBounds[3]) {
			exceededPadding = true;
		}
		if (mapBounds.getEast() > paddedBounds.getEast() && paddedBounds.getEast() < gridBounds[2]) {
			exceededPadding = true;
		}
		if (exceededPadding) {
			changeOMfileURL(map, url, latest, false);
		}
	}
};

export const getPaddedBounds = (map: maplibregl.Map) => {
	const domain = get(d);
	const domainObject = domainOptions.find(({ value }) => value === domain);

	const mapBounds = get(mB);
	const paddedBounds = get(pB);
	const paddedBoundsSource = get(pBS);

	if (domainObject && mapBounds && preferences.partial) {
		const gridBounds = GridFactory.create(domainObject.grid).getBounds();

		if (!paddedBoundsSource) {
			paddedBoundsGeoJSON.set({
				type: 'FeatureCollection',
				features: [
					{
						type: 'Feature',
						geometry: {
							type: 'LineString',
							// @ts-expect-error stupid conflicting types from geojson
							properties: {},
							coordinates: [
								[gridBounds[0], gridBounds[1]],
								[gridBounds[0], gridBounds[3]],
								[gridBounds[2], gridBounds[3]],
								[gridBounds[2], gridBounds[1]],
								[gridBounds[0], gridBounds[1]]
							]
						}
					}
				]
			});

			map.addSource('paddedBoundsSource', {
				type: 'geojson',
				data: get(paddedBoundsGeoJSON) as GeoJSON.GeoJSON
			});
			pBS.set(map.getSource('paddedBoundsSource'));

			map.addLayer({
				id: 'paddedBoundsLayer',
				type: 'line',
				source: 'paddedBoundsSource',
				layout: {
					'line-join': 'round',
					'line-cap': 'round'
				},
				paint: {
					'line-color': 'orange',
					'line-width': 5
				}
			});
			paddedBoundsLayer.set(map.getLayer('paddedBoundsLayer'));
		}

		const mapBoundsSW = mapBounds.getSouthWest();
		const mapBoundsNE = mapBounds.getNorthEast();
		const dLat = mapBoundsNE['lat'] - mapBoundsSW['lat'];
		const dLon = mapBoundsNE['lng'] - mapBoundsSW['lng'];

		paddedBounds?.setSouthWest([
			Math.max(Math.max(mapBoundsSW['lng'] - (dLon * padding) / 100, gridBounds[0]), -180),
			Math.max(Math.max(mapBoundsSW['lat'] - (dLat * padding) / 100, gridBounds[1]), -90)
		]);
		paddedBounds?.setNorthEast([
			Math.min(Math.min(mapBoundsNE['lng'] + (dLon * padding) / 100, gridBounds[2]), 180),
			Math.min(Math.min(mapBoundsNE['lat'] + (dLat * padding) / 100, gridBounds[3]), 90)
		]);
		pB.set(paddedBounds);
	}
};

/** e.g. /2025/06/06/1200Z/ */
const fmtModelRun = (modelRun: Date) => {
	return `${modelRun.getUTCFullYear()}/${pad(modelRun.getUTCMonth() + 1)}/${pad(modelRun.getUTCDate())}/${pad(modelRun.getUTCHours())}${pad(modelRun.getUTCMinutes())}Z`;
};

/** e.g. 2025-06-06-1200 */
const fmtSelectedTime = (time: Date) => {
	return `${time.getUTCFullYear()}-${pad(time.getUTCMonth() + 1)}-${pad(time.getUTCDate())}T${pad(time.getUTCHours())}${pad(time.getUTCMinutes())}`;
};

export const getOMUrl = () => {
	const domain = get(d);
	const uri =
		domain && domain.startsWith('dwd_icon')
			? `https://s3.servert.ch`
			: `https://map-tiles.open-meteo.com`;

	let url = `${uri}/data_spatial/${domain}`;

	const modelRun = get(mR);
	const selectedTime = get(time);
	url += `/${fmtModelRun(modelRun)}/${fmtSelectedTime(selectedTime)}.om`;

	const variable = get(v);
	url += `?variable=${variable}`;

	if (mode.current === 'dark') url += `&dark=true`;
	if (preferences.partial) url += `&partial=true`;
	if (vectorOptions.grid) url += `&grid=true`;
	if (vectorOptions.arrows) url += `&arrows=true`;
	if (vectorOptions.contours) url += `&contours=true`;
	if (
		vectorOptions.contours &&
		vectorOptions.contourInterval !== 2 //&&
		// vectorOptions.contourInterval !== defaultOmProtocolSettings.vectorOptions.contourInterval
	)
		url += `&interval=${vectorOptions.contourInterval}`;

	// values may not be parsed by url, but the url has to change for tile reload
	const tileSize = get(tS);
	if (tileSize !== 256) {
		url += `&tile-size=${tileSize}`;
	}

	const resolution = get(r);
	if (resolution !== 1) {
		url += `&resolution-factor=${resolution}`;
	}

	const paddedBounds = get(pB);
	if (paddedBounds && preferences.partial) {
		url += `&bounds=${paddedBounds.getSouth()},${paddedBounds.getWest()},${paddedBounds.getNorth()},${paddedBounds.getEast()}`;
	}

	return url;
};

const TIME_SELECTED_REGEX = new RegExp(/([0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}00)/);
export const getNextOmUrls = (
	omUrl: string,
	domain: Domain,
	metaJson: DomainMetaData | undefined
) => {
	let nextUrl, prevUrl;

	const url = `https://map-tiles.open-meteo.com/data_spatial/${domain.value}`;

	const matches = omUrl.match(TIME_SELECTED_REGEX);
	if (matches) {
		const date = new Date('20' + matches[0].substring(0, matches[0].length - 2) + ':00Z');
		const prevUrlDate = domainStep(date, domain.time_interval, 'backward');
		const nextUrlDate = domainStep(date, domain.time_interval, 'forward');
		let currentModelRun;
		if (metaJson) {
			currentModelRun = new Date(metaJson.reference_time);
		}
		let prevUrlModelRun = closestModelRun(prevUrlDate, domain.model_interval);
		if (currentModelRun && prevUrlModelRun > currentModelRun) {
			prevUrlModelRun = currentModelRun;
		}
		let nextUrlModelRun = closestModelRun(nextUrlDate, domain.model_interval);
		if (currentModelRun && nextUrlModelRun > currentModelRun) {
			nextUrlModelRun = currentModelRun;
		}
		prevUrl = url + `/${fmtModelRun(prevUrlModelRun)}/${fmtSelectedTime(prevUrlDate)}.om`;
		nextUrl = url + `/${fmtModelRun(nextUrlModelRun)}/${fmtSelectedTime(nextUrlDate)}.om`;
		return [prevUrl, nextUrl];
	} else {
		return undefined;
	}
};
