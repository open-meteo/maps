import { tick } from 'svelte';
import { get } from 'svelte/store';

import {
	VARIABLE_PREFIX,
	closestModelRun,
	domainStep,
	getColor,
	getColorScale,
	getValueFromLatLong
} from '@openmeteo/mapbox-layer';
import { booleanPointInPolygon, multiPolygon } from '@turf/turf';
import maplibregl from 'maplibre-gl';
import { mode } from 'mode-watcher';
import { toast } from 'svelte-sonner';

import { browser } from '$app/environment';
import { pushState } from '$app/navigation';

import { clippingCountryCodes } from '$lib/stores/clipping';
import { map as m } from '$lib/stores/map';
import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
import {
	type Preferences,
	completeDefaultValues,
	defaultPreferences,
	loading,
	opacity,
	preferences as p,
	resolution as r,
	tileSize as tS,
	url as u
} from '$lib/stores/preferences';
import {
	inProgress as iP,
	latest as l,
	metaJson as mJ,
	modelRun as mR,
	modelRunLocked as mRL,
	time
} from '$lib/stores/time';
import { domain as d, selectedDomain, variable as v } from '$lib/stores/variables';
import { type VectorOptions, vectorOptions as vO } from '$lib/stores/vector';

import {
	BEFORE_LAYER_RASTER,
	BEFORE_LAYER_VECTOR,
	BEFORE_LAYER_VECTOR_WATER_CLIP
} from '$lib/constants';

import {
	CLIP_COUNTRIES_PARAM,
	parseClipCountriesParam,
	serializeClipCountriesParam
} from './clipping';
import { formatISOUTCWithZ, parseISOWithoutTimezone } from './time-format';

import type { Domain, DomainMetaDataJson } from '@openmeteo/mapbox-layer';
import type { Map, MapMouseEvent, RasterTileSource, VectorTileSource } from 'maplibre-gl';

const { GeolocateControl, GlobeControl, NavigationControl, Popup } = maplibregl;

export { findTimeStep } from '$lib/time-utils';

let url: URL;
let map: Map | undefined;
let preferences: Preferences;
let metaJson: DomainMetaDataJson | undefined;
let vectorOptions: VectorOptions;

// Initialize store subscriptions only once on first access
let storesInitialized = false;
const initializeStores = () => {
	if (storesInitialized) return;
	storesInitialized = true;

	url = get(u);
	u.subscribe((newUrl) => {
		url = newUrl;
	});

	map = get(m);
	m.subscribe((newMap) => {
		map = newMap;
	});

	preferences = get(p);
	p.subscribe((newPreferences) => {
		preferences = newPreferences;
	});

	metaJson = get(mJ);
	mJ.subscribe((newMetaJson) => {
		metaJson = newMetaJson;
	});

	vectorOptions = get(vO);
	vO.subscribe((newVectorOptions) => {
		vectorOptions = newVectorOptions;
	});
};

const beforeLayerRaster = BEFORE_LAYER_RASTER;
const beforeLayerVector = BEFORE_LAYER_VECTOR;
const beforeLayerVectorWaterClip = BEFORE_LAYER_VECTOR_WATER_CLIP;

let omUrl: string;

/**
 * Pads a number with leading zeros to ensure 2 digits
 */
export const pad = (num: number | string): string => String(num).padStart(2, '0');

export const urlParamsToPreferences = () => {
	initializeStores();
	const params = new URLSearchParams(url.search);

	const urlModelTime = params.get('model_run');
	if (urlModelTime && urlModelTime.length == 15) {
		const parsedModelTime = parseISOWithoutTimezone(urlModelTime);
		mR.set(parsedModelTime);
		mRL.set(true);
	}

	const urlTime = params.get('time');
	if (urlTime && urlTime.length == 15) {
		const parsedUrlTime = parseISOWithoutTimezone(urlTime);
		time.set(parsedUrlTime);
	}

	if (params.get('globe')) {
		preferences.globe = params.get('globe') === 'true';
	} else {
		if (preferences.globe) {
			url.searchParams.set('globe', String(preferences.globe));
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

	const clipCountries = parseClipCountriesParam(params.get(CLIP_COUNTRIES_PARAM));
	if (clipCountries.length > 0) {
		clippingCountryCodes.set(clipCountries);
	} else {
		const currentCodes = get(clippingCountryCodes);
		const serialized = serializeClipCountriesParam(currentCodes);
		if (serialized) {
			url.searchParams.set(CLIP_COUNTRIES_PARAM, serialized);
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

export const setMapControlSettings = () => {
	if (!map) return;

	map.touchZoomRotate.disableRotation();

	const navigationControl = new NavigationControl({
		visualizePitch: true,
		showZoom: true,
		showCompass: true
	});
	map.addControl(navigationControl);

	const locateControl = new GeolocateControl({
		fitBoundsOptions: {
			maxZoom: 13.5
		},
		positionOptions: {
			enableHighAccuracy: true
		},
		trackUserLocation: true
	});
	map.addControl(locateControl);

	const globeControl = new GlobeControl();
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
		tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],
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

let omRasterSource: RasterTileSource | undefined;
export const addOmFileLayers = () => {
	if (!map) return;
	// when (re)-adding the om-file layers, we need to reset the vectorRequests to fix set the opacity correctly on the first request
	vectorRequests = 0;

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
			loading.set(false);
			clearInterval(checkRasterSourceLoadedInterval);
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

let omVectorSource: VectorTileSource | undefined;
export const addVectorLayer = () => {
	if (!map || !map.style) return;
	if (!map.getSource('omVectorSource' + String(vectorRequests))) {
		map.addSource('omVectorSource' + String(vectorRequests), {
			url: 'om://' + omUrl,
			type: 'vector'
		});
		omVectorSource = map.getSource('omVectorSource' + String(vectorRequests));
		if (omVectorSource) {
			omVectorSource.on('error', (e) => {
				clearInterval(checkVectorSourceLoadedInterval);
				toast.error(e.error.message);
			});
		}
	}

	if (vectorOptions.arrows && !map.getLayer('omVectorArrowLayer' + String(vectorRequests))) {
		map.addLayer(
			{
				id: 'omVectorArrowLayer' + String(vectorRequests),
				type: 'line',
				source: 'omVectorSource' + String(vectorRequests),
				'source-layer': 'wind-arrows',
				paint: {
					'line-opacity': vectorRequests === 0 ? 1 : 0,
					'line-opacity-transition': { duration: 300, delay: 0 },
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

	if (vectorOptions.grid && !map.getLayer('omVectorGridLayer' + String(vectorRequests))) {
		map.addLayer(
			{
				id: 'omVectorGridLayer' + String(vectorRequests),
				type: 'circle',
				source: 'omVectorSource' + String(vectorRequests),
				'source-layer': 'grid',
				paint: {
					'circle-opacity': vectorRequests === 0 ? 1 : 0,
					'circle-opacity-transition': { duration: 300, delay: 0 },
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

	if (vectorOptions.contours && !map.getLayer('omVectorContourLayer' + String(vectorRequests))) {
		map.addLayer(
			{
				id: 'omVectorContourLayer' + String(vectorRequests),
				type: 'line',
				source: 'omVectorSource' + String(vectorRequests),
				'source-layer': 'contours',
				paint: {
					'line-opacity': vectorRequests === 0 ? 1 : 0,
					'line-opacity-transition': { duration: 300, delay: 0 },
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

	if (
		vectorOptions.contours &&
		!map.getLayer('omVectorContourLayerLabels' + String(vectorRequests))
	) {
		map.addLayer(
			{
				id: 'omVectorContourLayerLabels' + String(vectorRequests),
				type: 'symbol',
				source: 'omVectorSource' + String(vectorRequests),
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
					'text-opacity': vectorRequests === 0 ? 1 : 0,
					'text-opacity-transition': { duration: 300, delay: 0 },
					'text-color': mode.current === 'dark' ? 'rgba(255,255,255, 0.8)' : 'rgba(0,0,0, 0.7)'
				}
			},
			preferences.clipWater ? beforeLayerVectorWaterClip : beforeLayerVector
		);
	}
};

export const removeOldVectorLayers = (untilCounter: number) => {
	if (!map) return;

	const layersOrder = map.getLayersOrder();

	const extractIndex = (layerId: string): number | null => {
		const match = layerId.match(/(\d+)$/);
		return match ? Number(match[1]) : null;
	};

	for (const layer of layersOrder) {
		const index = extractIndex(layer);
		if (index === null) continue;

		// Only touch layers up to (and including) untilCounter
		if (index > untilCounter) continue;

		if (layer.startsWith('omVectorGridLayer')) {
			map.removeLayer(layer);
		}

		if (layer.startsWith('omVectorArrowLayer')) {
			map.removeLayer(layer);
		}

		if (layer.startsWith('omVectorContourLayerLabels')) {
			if (map.getLayer(layer)) map.removeLayer(layer);
		}

		if (layer.startsWith('omVectorContourLayer')) {
			map.removeLayer(layer);
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

let checkRasterSourceLoadedInterval: ReturnType<typeof setInterval>;
const checkRasterLoaded = () => {
	if (checkRasterSourceLoadedInterval) clearInterval(checkRasterSourceLoadedInterval);
	let checked = 0;
	checkRasterSourceLoadedInterval = setInterval(() => {
		checked++;
		if (omRasterSource && omRasterSource.loaded()) {
			if (checked >= 200) {
				// Timeout after 10s
				toast.error('Request timed out');
			}
			checked = 0;
			loading.set(false);
			clearInterval(checkRasterSourceLoadedInterval);
		}
	}, 50);
};

let checkVectorSourceLoadedInterval: ReturnType<typeof setInterval>;
const checkVectorLoaded = (requestNumber: number) => {
	if (checkVectorSourceLoadedInterval) clearInterval(checkVectorSourceLoadedInterval);
	checkVectorSourceLoadedInterval = setInterval(() => {
		if (omVectorSource && omVectorSource.loaded()) {
			loading.set(false);
			clearInterval(checkVectorSourceLoadedInterval);
			fadeVectorLayers(0, requestNumber - 1);
			fadeVectorLayers(1, requestNumber);

			// this timeout should be slightly longer than the opacity transition
			setTimeout(() => removeOldVectorLayers(requestNumber - 1), 500);
		}
	}, 50);
};

let vectorRequests = 0;
export const changeOMfileURL = (vectorOnly = false, rasterOnly = false) => {
	if (!map || !omRasterSource) return;
	loading.set(true);

	if (popup) {
		popup.remove();
	}

	omUrl = getOMUrl();

	if (!vectorOnly) {
		omRasterSource.setUrl('om://' + omUrl);
		checkRasterLoaded();
	}
	if (!rasterOnly && omVectorSource) {
		vectorRequests++;
		addVectorLayer();
		checkVectorLoaded(vectorRequests);
	}
};

const fadeVectorLayers = (opacity: number, request: number) => {
	if (!map) return;

	if (map.getLayer('omVectorContourLayer' + String(request))) {
		map.setPaintProperty('omVectorContourLayer' + String(request), 'line-opacity', opacity);
	}
	if (map.getLayer('omVectorArrowLayer' + String(request))) {
		map.setPaintProperty('omVectorArrowLayer' + String(request), 'line-opacity', opacity);
	}
	if (map.getLayer('omVectorGridLayer' + String(request))) {
		map.setPaintProperty('omVectorGridLayer' + String(request), 'circle-opacity', opacity);
	}
	if (map.getLayer('omVectorContourLayerLabels' + String(request))) {
		map.setPaintProperty('omVectorContourLayerLabels' + String(request), 'text-opacity', opacity);
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
	dark?: boolean,
	globalOpacity?: number
): boolean => {
	const alpha = ((a || 1) * (globalOpacity || 100)) / 100;
	if (alpha < 0.65) {
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

	const updatePopup = (e: MapMouseEvent) => {
		if (!showPopup || !map) return;

		const coordinates = e.lngLat;
		if (!popup) {
			popup = new Popup({ closeButton: false })
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
			const omProtocolSettingsState = get(omProtocolSettings);
			const clippingOptions = omProtocolSettingsState.clippingOptions;
			if (clippingOptions) {
				if (!booleanPointInPolygon(coordinates.toArray(), multiPolygon(clippingOptions.polygons))) {
					popup
						.setLngLat(coordinates)
						.setHTML(`<span style="padding: 3px 5px;" class="popup-string">Outside clip</span>`);
					return;
				}
			}
			const dark = mode.current === 'dark';
			const colorScale = getColorScale(get(v), dark, omProtocolSettingsState.colorScales);
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
	map.on('click', (e: MapMouseEvent) => {
		if (!map) return;
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
		domain && domain.startsWith('dwd_icon') && !domain.endsWith('eps')
			? `https://s3.servert.ch`
			: `https://map-tiles.open-meteo.com`;

	let url = `${uri}/data_spatial/${domain}`;

	const modelRun = get(mR) as Date;
	const selectedTime = get(time);
	url += `/${fmtModelRun(modelRun)}/${fmtSelectedTime(selectedTime)}.om`;

	const variable = get(v);
	url += `?variable=${variable}`;

	if (mode.current === 'dark') url += `&dark=true`;
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

	const omProtocolSettingsState = get(omProtocolSettings);
	hashValue(JSON.stringify(omProtocolSettingsState.clippingOptions)).then((hash) => {
		url += `&clipping_options_hash=${hash}`;
	});
	hashValue(JSON.stringify(omProtocolSettingsState.clippingOptions)).then((hash) => {
		console.log(hash);
	});

	return url;
};
export const getNextOmUrls = (
	_omUrl: string,
	domain: Domain,
	metaJson: DomainMetaDataJson | undefined
): [string | undefined, string | undefined] => {
	const url = `https://map-tiles.open-meteo.com/data_spatial/${domain.value}`;

	const date = get(time);
	const dateString = formatISOUTCWithZ(date);
	let prevUrlDate: Date;
	let nextUrlDate: Date;
	if (metaJson) {
		const currentIndex = metaJson.valid_times.findIndex((vDateString) => {
			return dateString === vDateString;
		});
		prevUrlDate = new Date(metaJson.valid_times[currentIndex + 1]);
		nextUrlDate = new Date(metaJson.valid_times[currentIndex - 1]);
	} else {
		prevUrlDate = domainStep(date, domain.time_interval, 'backward');
		nextUrlDate = domainStep(date, domain.time_interval, 'forward');
	}
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
	const prevUrl = !isNaN(prevUrlDate.getTime())
		? url + `/${fmtModelRun(prevUrlModelRun)}/${fmtSelectedTime(prevUrlDate)}.om`
		: undefined;
	const nextUrl = !isNaN(nextUrlDate.getTime())
		? url + `/${fmtModelRun(nextUrlModelRun)}/${fmtSelectedTime(nextUrlDate)}.om`
		: undefined;
	return [prevUrl, nextUrl];
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
	try {
		const nextUrl = url.toString().replace(/%2C/g, ',');
		if (map) pushState(nextUrl + map._hash.getHashString(), {});
	} catch {
		pushState(url, {});
	}
};

export const getInitialMetaData = async () => {
	const domain = get(selectedDomain);

	const uri =
		domain && domain.value.startsWith('dwd_icon') && !domain.value.endsWith('eps')
			? `https://s3.servert.ch`
			: `https://map-tiles.open-meteo.com`;

	const metaJsonResults = await Promise.all([
		fetch(`${uri}/data_spatial/${domain.value}/latest.json`),
		fetch(`${uri}/data_spatial/${domain.value}/in-progress.json`)
	]);

	for (const metaResult of metaJsonResults) {
		if (!metaResult.ok) {
			loading.set(false);
			throw new Error(`HTTP ${metaResult.status}`);
		}
		if (metaResult.url.includes('latest.json')) {
			l.set(await metaResult.json());
		}
		if (metaResult.url.includes('in-progress.json')) {
			iP.set(await metaResult.json());
		}
	}
};

export const getMetaData = async (): Promise<DomainMetaDataJson> => {
	const domain = get(selectedDomain);
	let modelRun = get(mR);

	const latest = get(l);
	const latestReferenceTime = latest?.reference_time ? new Date(latest?.reference_time) : undefined;
	if (modelRun === undefined) {
		mR.set(latestReferenceTime);
		modelRun = get(mR) as Date;
	}
	if (latestReferenceTime) {
		if (modelRun.getTime() === latestReferenceTime?.getTime()) {
			return latest as DomainMetaDataJson;
		}
	}

	const inProgress = get(iP);
	const inProgressReferenceTime = inProgress?.reference_time
		? new Date(inProgress?.reference_time)
		: undefined;
	if (inProgressReferenceTime) {
		if (modelRun && modelRun.getTime() === inProgressReferenceTime?.getTime()) {
			return inProgress as DomainMetaDataJson;
		}
	}

	const uri =
		domain && domain.value.startsWith('dwd_icon') && !domain.value.endsWith('eps')
			? `https://s3.servert.ch`
			: `https://map-tiles.open-meteo.com`;

	const metaJsonUrl = `${uri}/data_spatial/${domain.value}/${fmtModelRun(modelRun as Date)}/meta.json`;

	const metaJsonResult = await fetch(metaJsonUrl);
	if (!metaJsonResult.ok) {
		loading.set(false);
		throw new Error(`HTTP ${metaJsonResult.status}`);
	}
	return await metaJsonResult.json();
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

export const throttle = <T extends unknown[]>(callback: (...args: T) => void, delay: number) => {
	let waiting = false;

	return (...args: T) => {
		if (waiting) {
			return;
		}

		callback(...args);
		waiting = true;

		setTimeout(() => {
			waiting = false;
		}, delay);
	};
};
