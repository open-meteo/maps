import { tick } from 'svelte';
import { SvelteDate } from 'svelte/reactivity';
import { get } from 'svelte/store';

import {
	GridFactory,
	TIME_SELECTED_REGEX,
	VARIABLE_PREFIX,
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
	map as m,
	mapBounds as mB,
	paddedBounds as pB,
	paddedBoundsSource as pBS,
	paddedBoundsGeoJSON,
	paddedBoundsLayer
} from '$lib/stores/map';
import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
import {
	completeDefaultValues,
	defaultPreferences,
	loading,
	metaJson as mJ,
	modelRun as mR,
	opacity,
	preferences as p,
	resolution as r,
	tileSize as tS,
	time,
	url as u
} from '$lib/stores/preferences';
import { domain as d, selectedDomain, variable as v } from '$lib/stores/variables';
import { vectorOptions as vO } from '$lib/stores/vector';

import type { Domain, DomainMetaData } from '@openmeteo/mapbox-layer';

let url = get(u);
u.subscribe((newUrl) => {
	url = newUrl;
});

let map = get(m);
m.subscribe((newMap) => {
	map = newMap;
});

let preferences = get(p);
p.subscribe((newPreferences) => {
	preferences = newPreferences;
});

let metaJson = get(mJ);
mJ.subscribe((newMetaJson) => {
	metaJson = newMetaJson;
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

export const urlParamsToPreferences = () => {
	const params = new URLSearchParams(url.search);

	const urlModelTime = params.get('model_run');
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
	checkClosestDomainInterval();

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

	if (params.get('time_selector')) {
		preferences.timeSelector = params.get('time_selector') === 'true';
	} else {
		if (!preferences.timeSelector) {
			url.searchParams.set('time_selector', String(preferences.timeSelector));
		}
	}

	if (params.get('clip_water')) {
		preferences.clipWater = params.get('clip_water') === 'true';
	} else {
		if (preferences.clipWater) {
			url.searchParams.set('clip_water', String(preferences.clipWater));
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
	p.set(preferences);
};

/** "YYYY-MM-DDTHHMM" */
export const fmtISOWithoutTimezone = (d: Date) => d.toISOString().replace(/[:Z]/g, '').slice(0, 15);

export const checkClosestDomainInterval = () => {
	const t = get(time);
	const domain = get(selectedDomain);
	const closestTime = domainStep(t, domain.time_interval, 'floor');
	updateUrl('time', fmtISOWithoutTimezone(closestTime));
	time.set(closestTime);
};

export const checkClosestModelRun = () => {
	let timeStep = get(time);
	const domain = get(selectedDomain);

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
	if (metaJson) {
		const latestTimeStep = new Date(metaJson.valid_times[metaJson.valid_times.length - 1]);
		if (timeStep.getTime() > latestTimeStep.getTime()) {
			toast.warning('Date selected too new, using latest available time');
			time.set(latestTimeStep);
			timeStep = latestTimeStep;
		}
	}

	const nearestModelRun = closestModelRun(timeStep, domain.model_interval);
	const modelRun = get(mR);

	let setToModelRun = new SvelteDate(modelRun);

	const latestReferenceTime = metaJson?.reference_time
		? new Date(metaJson.reference_time)
		: undefined;

	if (latestReferenceTime && nearestModelRun.getTime() > latestReferenceTime.getTime()) {
		setToModelRun = new SvelteDate(latestReferenceTime);
	} else if (timeStep.getTime() < modelRun.getTime()) {
		setToModelRun = new SvelteDate(nearestModelRun);
	} else {
		if (latestReferenceTime) {
			if (latestReferenceTime.getTime() === modelRun.getTime()) {
				url.searchParams.delete('model_run');
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
		updateUrl('model_run', fmtISOWithoutTimezone(setToModelRun));
		toast.info('Model run set to: ' + fmtISOWithoutTimezone(setToModelRun));
	} else {
		updateUrl();
	}
};

export const setMapControlSettings = () => {
	if (!map) return;

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
	globeControl._globeButton.addEventListener('click', () => globeHandler());

	// improved scrolling
	map.scrollZoom.setZoomRate(1 / 85);
	map.scrollZoom.setWheelZoomRate(1 / 85);
};

export const addHillshadeSources = () => {
	if (!map) return;

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

export const addHillshadeLayer = () => {
	if (!map) return;

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
export const addOmFileLayers = () => {
	if (!map) return;

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

	const opacityValue = get(opacity);
	map.addLayer(
		{
			id: 'omRasterLayer',
			type: 'raster',
			source: 'omRasterSource',
			paint: {
				'raster-opacity': mode.current === 'dark' ? (opacityValue - 10) / 100 : opacityValue / 100
			}
		},
		beforeLayerRaster
	);

	if (vectorOptions.contours || vectorOptions.arrows) {
		addVectorLayer();
	}
};

let omVectorSource: maplibregl.VectorTileSource | undefined;
export const addVectorLayer = () => {
	if (!map) return;
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
						mode.current === 'dark' ? 'rgba(255,255,255, 0.8)' : 'rgba(0,0,0, 0.6)',
						[
							'case',
							['boolean', ['==', ['%', ['to-number', ['get', 'value']], 50], 0], false],
							mode.current === 'dark' ? 'rgba(255,255,255, 0.7)' : 'rgba(0,0,0, 0.5)',

							[
								'case',
								['boolean', ['==', ['%', ['to-number', ['get', 'value']], 10], 0], false],
								mode.current === 'dark' ? 'rgba(255,255,255, 0.6)' : 'rgba(0,0,0, 0.4)',
								mode.current === 'dark' ? 'rgba(255,255,255, 0.5)' : 'rgba(0,0,0, 0.3)'
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
						['boolean', ['>', ['to-number', ['get', 'value']], 9], false],
						mode.current === 'dark' ? 'rgba(255,255,255, 0.6)' : 'rgba(0,0,0, 0.6)',
						[
							'case',
							['boolean', ['>', ['to-number', ['get', 'value']], 5], false],
							mode.current === 'dark' ? 'rgba(255,255,255, 0.6)' : 'rgba(0,0,0, 0.6)',
							[
								'case',
								['boolean', ['>', ['to-number', ['get', 'value']], 4], false],
								mode.current === 'dark' ? 'rgba(255,255,255, 0.5)' : 'rgba(0,0,0, 0.5)',

								[
									'case',
									['boolean', ['>', ['to-number', ['get', 'value']], 3], false],
									mode.current === 'dark' ? 'rgba(255,255,255, 0.4)' : 'rgba(0,0,0, 0.4)',
									[
										'case',
										['boolean', ['>', ['to-number', ['get', 'value']], 2], false],
										mode.current === 'dark' ? 'rgba(255,255,255, 0.3)' : 'rgba(0,0,0, 0.3)',
										mode.current === 'dark' ? 'rgba(255,255,255, 0.2)' : 'rgba(0,0,0, 0.2)'
									]
								]
							]
						]
					],
					'line-width': [
						'case',
						['boolean', ['>', ['to-number', ['get', 'value']], 20], false],
						2.8,
						[
							'case',
							['boolean', ['>', ['to-number', ['get', 'value']], 10], false],
							2.2,
							[
								'case',
								['boolean', ['>', ['to-number', ['get', 'value']], 5], false],
								2,

								[
									'case',
									['boolean', ['>', ['to-number', ['get', 'value']], 3], false],
									1.8,
									['case', ['boolean', ['>', ['to-number', ['get', 'value']], 2], false], 1.6, 1.5]
								]
							]
						]
					]
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
					'text-color': mode.current === 'dark' ? 'rgba(255,255,255, 0.8)' : 'rgba(0,0,0, 0.7)'
				}
			},
			preferences.clipWater ? beforeLayerVectorWaterClip : beforeLayerVector
		);
	}
};

export const removeVectorLayer = () => {
	if (!map) return;

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

export const terrainHandler = () => {
	preferences.terrain = !preferences.terrain;
	p.set(preferences);
	updateUrl('terrain', String(preferences.terrain), String(defaultPreferences.terrain));
};

export const globeHandler = () => {
	preferences.globe = !preferences.globe;
	p.set(preferences);
	updateUrl('globe', String(preferences.globe), String(defaultPreferences.globe));
};

let checked = 0;
let checkSourceLoadedInterval: ReturnType<typeof setInterval>;
export const changeOMfileURL = (resetBounds = true, vectorOnly = false, rasterOnly = false) => {
	if (!map || !omRasterSource) return;

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
	getPaddedBounds();

	checkClosestModelRun();

	omUrl = getOMUrl();
	if (!vectorOnly) {
		omRasterSource.setUrl('om://' + omUrl);
	}

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
	dark?: boolean,
	globalOpacity?: number
): boolean => {
	if ((a != undefined && a < 0.65) || (globalOpacity && globalOpacity < 65)) {
		if (dark) {
			return true;
		} else {
			return false;
		}
	}
	// check luminance
	return r * 0.299 + g * 0.587 + b * 0.114 <= 150;
};

let popup: maplibregl.Popup | undefined;
let showPopup = false;
export const addPopup = () => {
	if (!map) return;

	const updatePopup = (e: maplibregl.MapMouseEvent) => {
		if (!showPopup) return;

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
			const colorScale = getColorScale(get(v), dark, omProtocolSettings.colorScales);
			const color = getColor(colorScale, value);
			const content = '<span class="popup-value">' + value.toFixed(1) + '</span>' + colorScale.unit;
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
export const checkBounds = () => {
	if (!map) return;

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
			changeOMfileURL(false);
		}
	}
};

export const getPaddedBounds = () => {
	if (!map) return;

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
	if (vectorOptions.contours && !vectorOptions.breakpoints)
		url += `&intervals=${vectorOptions.contourInterval}`;

	// values may not be parsed by url, but the url has to change for tile reload
	const tileSize = get(tS);
	if (tileSize !== 256) {
		url += `&tile_size=${tileSize}`;
	}

	const resolution = get(r);
	if (resolution !== 1) {
		url += `&resolution_factor=${resolution}`;
	}

	const paddedBounds = get(pB);
	if (paddedBounds && preferences.partial) {
		url += `&bounds=${paddedBounds.getSouth()},${paddedBounds.getWest()},${paddedBounds.getNorth()},${paddedBounds.getEast()}`;
	}

	return url;
};

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

export const hashValue = (val: string) =>
	crypto.subtle.digest('SHA-256', new TextEncoder().encode(val)).then((h) => {
		const hexes = [],
			view = new DataView(h);
		for (let i = 0; i < view.byteLength; i += 4)
			hexes.push(('00000000' + view.getUint32(i).toString(16)).slice(-8));
		return hexes.join('');
	});

export const updateUrl = async (
	urlParam: undefined | string = undefined,
	newValue: undefined | string = undefined,
	defaultValue: undefined | string = undefined
) => {
	if (!url) return;

	if (!defaultValue && urlParam) {
		if (completeDefaultValues[urlParam]) {
			defaultValue = String(completeDefaultValues[urlParam]);
		}
	}

	if (urlParam) {
		if (newValue && newValue !== defaultValue) {
			url.searchParams.set(urlParam, String(newValue));
		} else {
			url.searchParams.delete(urlParam);
		}
	}

	await tick();
	if (map && map._hash) {
		pushState(url + map._hash.getHashString(), {});
	} else {
		pushState(url, {});
	}
};

export const getMetaData = async (inProgress = false): Promise<DomainMetaData> => {
	const domain = get(selectedDomain);
	const uri =
		domain && domain.value.startsWith('dwd_icon')
			? `https://s3.servert.ch`
			: `https://map-tiles.open-meteo.com`;

	const metaJsonUrl = `${uri}/data_spatial/${domain.value}/${inProgress ? 'in-progress' : 'latest'}.json`;
	const metaJsonResult = await fetch(metaJsonUrl);
	if (!metaJsonResult.ok) {
		loading.set(false);
		throw new Error(`HTTP ${metaJsonResult.status}`);
	}
	const json = await metaJsonResult.json();
	return json;
};

export const matchVariableOrFirst = () => {
	const variable = get(v);
	let matchedVariable = undefined;
	if (metaJson && !metaJson?.variables.includes(variable)) {
		// check for similar level variables
		const prefixMatch = variable.match(VARIABLE_PREFIX);
		const prefix = prefixMatch?.groups?.prefix;
		if (prefix) {
			for (const mjVariable of metaJson.variables) {
				if (mjVariable.startsWith(prefix)) {
					matchedVariable = mjVariable;
					break;
				}
			}
		}

		if (!matchedVariable) {
			matchedVariable = metaJson.variables[0];
		}
	}
	if (matchedVariable) {
		v.set(matchedVariable);
	}
};
