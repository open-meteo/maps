import { tick } from 'svelte';
import { get } from 'svelte/store';

import {
	type Domain,
	type DomainMetaDataJson,
	VARIABLE_PREFIX,
	closestModelRun,
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

import { map as m } from '$lib/stores/map';
import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
import {
	type Preferences,
	completeDefaultValues,
	defaultPreferences,
	loading,
	opacity,
	preferences as p,
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
import { type SlotLayer, SlotManager } from '$lib/slot-manager';

import { formatISOUTCWithZ, parseISOWithoutTimezone } from './time-format';

export { findTimeStep } from '$lib/time-utils';

// =============================================================================
// Module-level state
// =============================================================================

let url: URL;
let map: maplibregl.Map | undefined;
let preferences: Preferences;
let metaJson: DomainMetaDataJson | undefined;
let vectorOptions: VectorOptions;
let omUrl: string;
let popup: maplibregl.Popup | undefined;
let showPopup = false;

let storesInitialized = false;

const initializeStores = () => {
	if (storesInitialized) return;
	storesInitialized = true;

	url = get(u);
	u.subscribe((v) => {
		url = v;
	});

	map = get(m);
	m.subscribe((v) => {
		map = v;
	});

	preferences = get(p);
	p.subscribe((v) => {
		preferences = v;
	});

	metaJson = get(mJ);
	mJ.subscribe((v) => {
		metaJson = v;
	});

	vectorOptions = get(vO);
	vO.subscribe((v) => {
		vectorOptions = v;
	});
};

// =============================================================================
// Utilities
// =============================================================================

/**
 * Pads a number with leading zeros to ensure 2 digits
 */
export const pad = (num: number | string): string => String(num).padStart(2, '0');

export const fmtModelRun = (modelRun: Date): string =>
	`${modelRun.getUTCFullYear()}/${pad(modelRun.getUTCMonth() + 1)}/${pad(modelRun.getUTCDate())}/${pad(modelRun.getUTCHours())}${pad(modelRun.getUTCMinutes())}Z`;

export const fmtSelectedTime = (t: Date): string =>
	`${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}`;

const getBaseUri = (_domainValue: string): string => 'https:/openmeteo.s3.amazonaws.com/';

export const hashValue = (val: string): Promise<string> =>
	crypto.subtle.digest('SHA-256', new TextEncoder().encode(val)).then((h) => {
		const view = new DataView(h);
		const hexes: string[] = [];
		for (let i = 0; i < view.byteLength; i += 4)
			hexes.push(('00000000' + view.getUint32(i).toString(16)).slice(-8));
		return hexes.join('');
	});

export const throttle = <T extends unknown[]>(
	callback: (...args: T) => void,
	delay: number
): ((...args: T) => void) => {
	let waiting = false;
	return (...args: T) => {
		if (waiting) return;
		callback(...args);
		waiting = true;
		setTimeout(() => {
			waiting = false;
		}, delay);
	};
};

function isHighDensity(): boolean {
	return (
		window.matchMedia?.(
			'only screen and (min-resolution: 124dpi), only screen and (min-resolution: 1.3dppx), only screen and (min-resolution: 48.8dpcm)'
		).matches ||
		window.matchMedia?.(
			'only screen and (-webkit-min-device-pixel-ratio: 1.3), only screen and (-o-min-device-pixel-ratio: 2.6/2), only screen and (min--moz-device-pixel-ratio: 1.3), only screen and (min-device-pixel-ratio: 1.3)'
		).matches ||
		window.devicePixelRatio > 1.3
	);
}

function isRetina(): boolean {
	return (
		(window.matchMedia?.(
			'only screen and (min-resolution: 192dpi), only screen and (min-resolution: 2dppx), only screen and (min-resolution: 75.6dpcm)'
		).matches ||
			window.matchMedia?.(
				'only screen and (-webkit-min-device-pixel-ratio: 2), only screen and (-o-min-device-pixel-ratio: 2/1), only screen and (min--moz-device-pixel-ratio: 2), only screen and (min-device-pixel-ratio: 2)'
			).matches ||
			window.devicePixelRatio >= 2) &&
		/(iPad|iPhone|iPod)/g.test(navigator.userAgent)
	);
}

export const checkHighDefinition = (): boolean => (browser ? isRetina() || isHighDensity() : false);

export const textWhite = (
	[r, g, b, a]: [number, number, number, number] | [number, number, number],
	dark?: boolean,
	globalOpacity?: number
): boolean => {
	const alpha = ((a ?? 1) * (globalOpacity ?? 100)) / 100;
	if (alpha < 0.65) return dark ?? false;
	return r * 0.299 + g * 0.587 + b * 0.114 <= 150;
};

// =============================================================================
// URL management
// =============================================================================

export const updateUrl = async (
	urlParam?: string,
	newValue?: string,
	defaultValue?: string
): Promise<void> => {
	if (!url) return;

	if (!defaultValue && urlParam && completeDefaultValues[urlParam]) {
		defaultValue = String(completeDefaultValues[urlParam]);
	}

	if (urlParam) {
		if (newValue && newValue !== defaultValue) {
			url.searchParams.set(urlParam, newValue);
		} else {
			url.searchParams.delete(urlParam);
		}
	}

	await tick();
	try {
		if (map)
			pushState(
				url +
					(map as maplibregl.Map & { _hash: { getHashString(): string } })._hash.getHashString(),
				{}
			);
	} catch {
		pushState(url, {});
	}
};

export const urlParamsToPreferences = () => {
	initializeStores();
	const params = new URLSearchParams(url.search);

	const urlModelTime = params.get('model_run');
	if (urlModelTime?.length === 15) {
		mR.set(parseISOWithoutTimezone(urlModelTime));
		mRL.set(true);
	}

	const urlTime = params.get('time');
	if (urlTime?.length === 15) {
		time.set(parseISOWithoutTimezone(urlTime));
	}

	const syncBoolParam = (paramKey: string, prefKey: keyof Preferences, writeIfDefault: boolean) => {
		const raw = params.get(paramKey);
		if (raw !== null) {
			preferences[prefKey] = raw === 'true';
		} else if (writeIfDefault ? true : preferences[prefKey]) {
			url.searchParams.set(paramKey, String(preferences[prefKey]));
		}
	};

	syncBoolParam('globe', 'globe', false);
	syncBoolParam('terrain', 'terrain', false);
	syncBoolParam('hillshade', 'hillshade', false);
	syncBoolParam('clip_water', 'clipWater', false);

	const timeSelectorRaw = params.get('time_selector');
	if (timeSelectorRaw !== null) {
		preferences.timeSelector = timeSelectorRaw === 'true';
	} else if (!preferences.timeSelector) {
		url.searchParams.set('time_selector', String(preferences.timeSelector));
	}

	const domain = params.get('domain');
	if (domain) {
		d.set(domain);
	} else if (get(d) !== 'dwd_icon') {
		url.searchParams.set('domain', get(d));
	}

	const variable = params.get('variable');
	if (variable) {
		v.set(variable);
	} else if (get(v) !== 'temperature_2m') {
		url.searchParams.set('variable', get(v));
	}

	const arrowsRaw = params.get('arrows');
	if (arrowsRaw !== null) {
		vectorOptions.arrows = arrowsRaw === 'true';
	} else if (!vectorOptions.arrows) {
		url.searchParams.set('arrows', String(vectorOptions.arrows));
	}

	const contoursRaw = params.get('contours');
	if (contoursRaw !== null) {
		vectorOptions.contours = contoursRaw === 'true';
	} else if (vectorOptions.contours) {
		url.searchParams.set('contours', String(vectorOptions.contours));
	}

	const intervalRaw = params.get('interval');
	if (intervalRaw !== null) {
		vectorOptions.contourInterval = Number(intervalRaw);
	} else if (vectorOptions.contourInterval !== 2) {
		url.searchParams.set('interval', String(vectorOptions.contourInterval));
	}

	vO.set(vectorOptions);
	p.set(preferences);
};

// =============================================================================
// Map controls & style
// =============================================================================

export const setMapControlSettings = () => {
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
		url: 'https://tiles.mapterhorn.com/tilejson.json'
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
		BEFORE_LAYER_RASTER
	);
};

export const getStyle = async () => {
	const style = await fetch(
		`https://tiles.open-meteo.com/styles/minimal-planet-maps${mode.current === 'dark' ? '-dark' : ''}${preferences.clipWater ? '-water-clip' : ''}.json`
	).then((r) => r.json());

	return preferences.globe ? { ...style, projection: { type: 'globe' } } : style;
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

// =============================================================================
// OM URL construction
// =============================================================================

export const getOMUrl = () => {
	const domain = get(d);
	const base = `${getBaseUri(domain)}/data_spatial/${domain}`;
	const modelRun = get(mR) as Date;
	const selectedTime = get(time);

	let result = `${base}/${fmtModelRun(modelRun)}/${fmtSelectedTime(selectedTime)}.om`;
	result += `?variable=${get(v)}`;

	if (mode.current === 'dark') result += '&dark=true';
	if (vectorOptions.grid) result += '&grid=true';
	if (vectorOptions.arrows) result += '&arrows=true';
	if (vectorOptions.contours) result += '&contours=true';
	if (vectorOptions.contours && !vectorOptions.breakpoints)
		result += `&intervals=${vectorOptions.contourInterval}`;

	const tileSize = get(tS);
	if (tileSize !== 256) result += `&tile_size=${tileSize}`;

	return result;
};

export const getNextOmUrls = (
	_omUrl: string,
	domain: Domain,
	metaJson: DomainMetaDataJson | undefined
): [string | undefined, string | undefined] => {
	const base = `https://map-tiles.open-meteo.com/data_spatial/${domain.value}`;
	const date = get(time);
	const dateString = formatISOUTCWithZ(date);

	let prevDate: Date;
	let nextDate: Date;

	if (metaJson) {
		const idx = metaJson.valid_times.findIndex((s) => s === dateString);
		prevDate = new Date(metaJson.valid_times[idx + 1]);
		nextDate = new Date(metaJson.valid_times[idx - 1]);
	} else {
		prevDate = domainStep(date, domain.time_interval, 'backward');
		nextDate = domainStep(date, domain.time_interval, 'forward');
	}

	const currentModelRun = metaJson ? new Date(metaJson.reference_time) : undefined;

	const clampRun = (run: Date): Date =>
		currentModelRun && run > currentModelRun ? currentModelRun : run;

	const prevModelRun = clampRun(closestModelRun(prevDate, domain.model_interval));
	const nextModelRun = clampRun(closestModelRun(nextDate, domain.model_interval));

	const prevUrl = !isNaN(prevDate.getTime())
		? `${base}/${fmtModelRun(prevModelRun)}/${fmtSelectedTime(prevDate)}.om`
		: undefined;
	const nextUrl = !isNaN(nextDate.getTime())
		? `${base}/${fmtModelRun(nextModelRun)}/${fmtSelectedTime(nextDate)}.om`
		: undefined;

	return [prevUrl, nextUrl];
};

// =============================================================================
// Metadata fetching
// =============================================================================

export const getInitialMetaData = async () => {
	const domain = get(selectedDomain);
	const uri = getBaseUri(domain.value);

	const [latestRes, inProgressRes] = await Promise.all([
		fetch(`${uri}/data_spatial/${domain.value}/latest.json`),
		fetch(`${uri}/data_spatial/${domain.value}/in-progress.json`)
	]);

	for (const res of [latestRes, inProgressRes]) {
		if (!res.ok) {
			loading.set(false);
			throw new Error(`HTTP ${res.status}`);
		}
		if (res.url.includes('latest.json')) l.set(await res.json());
		if (res.url.includes('in-progress.json')) iP.set(await res.json());
	}
};

export const getMetaData = async (): Promise<DomainMetaDataJson> => {
	const domain = get(d);
	const uri = getBaseUri(domain);
	let modelRun = get(mR);

	const latest = get(l);
	const latestReferenceTime = latest?.reference_time ? new Date(latest.reference_time) : undefined;

	if (modelRun === undefined) {
		mR.set(latestReferenceTime);
		modelRun = get(mR) as Date;
	}

	if (latestReferenceTime && modelRun.getTime() === latestReferenceTime.getTime()) {
		return latest as DomainMetaDataJson;
	}

	const inProgress = get(iP);
	const inProgressReferenceTime = inProgress?.reference_time
		? new Date(inProgress.reference_time)
		: undefined;

	if (inProgressReferenceTime && modelRun.getTime() === inProgressReferenceTime.getTime()) {
		return inProgress as DomainMetaDataJson;
	}

	const metaJsonUrl = `${uri}/data_spatial/${domain}/${fmtModelRun(modelRun)}/meta.json`;
	const res = await fetch(metaJsonUrl);

	if (!res.ok) {
		loading.set(false);
		throw new Error(`HTTP ${res.status}`);
	}

	return res.json();
};

export const matchVariableOrFirst = () => {
	const variable = get(v);
	if (!metaJson || metaJson.variables.includes(variable)) return;

	let matched: string | undefined;
	const prefix = variable.match(VARIABLE_PREFIX)?.groups?.prefix;

	if (prefix) {
		matched = metaJson.variables.find((mv) => mv.startsWith(prefix));
	}

	v.set(matched ?? metaJson.variables[0]);
};

// =============================================================================
// Expression helpers
// =============================================================================

const dark = (): boolean => mode.current === 'dark';
const rgba = (light: string, d: string): string => (dark() ? d : light);

const getRasterOpacity = (): number => {
	const opacityValue = get(opacity) / 100;
	return mode.current === 'dark' ? Math.max(0, (opacityValue * 100 - 10) / 100) : opacityValue;
};

const mkArrowColor = (): maplibregl.ExpressionSpecification => {
	let expr: maplibregl.ExpressionSpecification = [
		'literal',
		rgba('rgba(0,0,0, 0.2)', 'rgba(255,255,255, 0.2)')
	];
	const thresholds: [number, string, string][] = [
		[2, 'rgba(0,0,0, 0.3)', 'rgba(255,255,255, 0.3)'],
		[3, 'rgba(0,0,0, 0.4)', 'rgba(255,255,255, 0.4)'],
		[4, 'rgba(0,0,0, 0.5)', 'rgba(255,255,255, 0.5)'],
		[5, 'rgba(0,0,0, 0.6)', 'rgba(255,255,255, 0.6)'],
		[9, 'rgba(0,0,0, 0.6)', 'rgba(255,255,255, 0.6)']
	];
	for (const [threshold, light, d] of [...thresholds].reverse()) {
		expr = [
			'case',
			['boolean', ['>', ['to-number', ['get', 'value']], threshold], false],
			rgba(light, d),
			expr
		];
	}
	return expr;
};

const mkArrowWidth = (): maplibregl.ExpressionSpecification => [
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
];

const mkContourColor = (): maplibregl.ExpressionSpecification => [
	'case',
	['boolean', ['==', ['%', ['to-number', ['get', 'value']], 100], 0], false],
	rgba('rgba(0,0,0, 0.6)', 'rgba(255,255,255, 0.8)'),
	[
		'case',
		['boolean', ['==', ['%', ['to-number', ['get', 'value']], 50], 0], false],
		rgba('rgba(0,0,0, 0.5)', 'rgba(255,255,255, 0.7)'),
		[
			'case',
			['boolean', ['==', ['%', ['to-number', ['get', 'value']], 10], 0], false],
			rgba('rgba(0,0,0, 0.4)', 'rgba(255,255,255, 0.6)'),
			rgba('rgba(0,0,0, 0.3)', 'rgba(255,255,255, 0.5)')
		]
	]
];

const mkContourWidth = (): maplibregl.ExpressionSpecification => [
	'case',
	['boolean', ['==', ['%', ['to-number', ['get', 'value']], 100], 0], false],
	3,
	[
		'case',
		['boolean', ['==', ['%', ['to-number', ['get', 'value']], 50], 0], false],
		2.5,
		['case', ['boolean', ['==', ['%', ['to-number', ['get', 'value']], 10], 0], false], 2, 1]
	]
];

// =============================================================================
// Layer definitions
// =============================================================================

const rasterLayer = (): SlotLayer => ({
	id: 'omRasterLayer',
	opacityProp: 'raster-opacity',
	commitOpacity: getRasterOpacity(),
	add: (map, sourceId, layerId, beforeLayer) => {
		map.addLayer(
			{
				id: layerId,
				type: 'raster',
				source: sourceId,
				paint: {
					'raster-opacity': 0.0,
					'raster-opacity-transition': { duration: 2, delay: 0 }
				}
			},
			beforeLayer
		);
	}
});

const vectorArrowLayer = (): SlotLayer => ({
	id: 'omVectorArrowLayer',
	opacityProp: 'line-opacity',
	commitOpacity: 1,
	add: (map, sourceId, layerId, beforeLayer) => {
		if (!vectorOptions.arrows) return;
		map.addLayer(
			{
				id: layerId,
				type: 'line',
				source: sourceId,
				'source-layer': 'wind-arrows',
				paint: {
					'line-opacity': 0,
					'line-opacity-transition': { duration: 200, delay: 0 },
					'line-color': mkArrowColor(),
					'line-width': mkArrowWidth()
				},
				layout: { 'line-cap': 'round' }
			},
			beforeLayer
		);
	}
});

const vectorGridLayer = (): SlotLayer => ({
	id: 'omVectorGridLayer',
	opacityProp: 'circle-opacity',
	commitOpacity: 1,
	add: (map, sourceId, layerId, beforeLayer) => {
		if (!vectorOptions.grid) return;
		map.addLayer(
			{
				id: layerId,
				type: 'circle',
				source: sourceId,
				'source-layer': 'grid',
				paint: {
					'circle-opacity': 0,
					'circle-opacity-transition': { duration: 200, delay: 0 },
					'circle-radius': ['interpolate', ['exponential', 1.5], ['zoom'], 0, 0.1, 12, 10],
					'circle-color': 'orange'
				}
			},
			beforeLayer
		);
	}
});

const vectorContourLayer = (): SlotLayer => ({
	id: 'omVectorContourLayer',
	opacityProp: 'line-opacity',
	commitOpacity: 1,
	add: (map, sourceId, layerId, beforeLayer) => {
		if (!vectorOptions.contours) return;
		map.addLayer(
			{
				id: layerId,
				type: 'line',
				source: sourceId,
				'source-layer': 'contours',
				paint: {
					'line-opacity': 0,
					'line-opacity-transition': { duration: 200, delay: 0 },
					'line-color': mkContourColor(),
					'line-width': mkContourWidth()
				}
			},
			beforeLayer
		);
	}
});

const vectorContourLabelsLayer = (): SlotLayer => ({
	id: 'omVectorContourLayerLabels',
	opacityProp: 'text-opacity',
	commitOpacity: 1,
	add: (map, sourceId, layerId, beforeLayer) => {
		if (!vectorOptions.contours) return;
		map.addLayer(
			{
				id: layerId,
				type: 'symbol',
				source: sourceId,
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
					'text-opacity': 0,
					'text-opacity-transition': { duration: 200, delay: 0 },
					'text-color': rgba('rgba(0,0,0, 0.7)', 'rgba(255,255,255, 0.8)')
				}
			},
			beforeLayer
		);
	}
});

// =============================================================================
// Manager instances
// =============================================================================

let rasterManager: SlotManager | undefined;
let vectorManager: SlotManager | undefined;

const createManagers = (): void => {
	if (!map) return;

	rasterManager = new SlotManager(map, {
		sourceIdPrefix: 'omRasterSource',
		beforeLayer: BEFORE_LAYER_RASTER,
		layerFactory: () => [rasterLayer()],
		sourceSpec: (sourceUrl) => ({
			url: sourceUrl,
			type: 'raster',
			maxzoom: 14
		}),
		removeDelayMs: 300,
		onCommit: () => {
			loading.set(false);
			refreshPopup();
		},
		onError: () => loading.set(false),
		slowLoadWarningMs: 10000,
		onSlowLoad: () =>
			toast.warning('Loading raster data might be limited by bandwidth or upstream server speed.')
	});

	vectorManager = new SlotManager(map, {
		sourceIdPrefix: 'omVectorSource',
		beforeLayer: preferences.clipWater ? BEFORE_LAYER_VECTOR_WATER_CLIP : BEFORE_LAYER_VECTOR,
		layerFactory: () => [
			vectorArrowLayer(),
			vectorGridLayer(),
			vectorContourLayer(),
			vectorContourLabelsLayer()
		],
		sourceSpec: (sourceUrl) => ({ url: sourceUrl, type: 'vector' }),
		removeDelayMs: 250
	});
};

// =============================================================================
// Public layer API
// =============================================================================

export const addOmFileLayers = (): void => {
	if (!map) return;
	omUrl = getOMUrl();
	createManagers();
	rasterManager?.update('om://' + omUrl);
	vectorManager?.update('om://' + omUrl);
};

export const changeOMfileURL = (vectorOnly = false, rasterOnly = false): void => {
	if (!map) return;
	loading.set(true);
	omUrl = getOMUrl();

	const beforeLayer = preferences.clipWater ? BEFORE_LAYER_VECTOR_WATER_CLIP : BEFORE_LAYER_VECTOR;
	vectorManager?.setBeforeLayer(beforeLayer);

	if (!vectorOnly) rasterManager?.update('om://' + omUrl);
	if (!rasterOnly) vectorManager?.update('om://' + omUrl);
};

// =============================================================================
// Popup
// =============================================================================

let popupCoordinates: maplibregl.LngLat | undefined;

const renderPopup = (coordinates: maplibregl.LngLat): void => {
	if (!showPopup || !map) return;

	if (!popup) {
		popup = new maplibregl.Popup({ closeButton: false })
			.setLngLat(coordinates)
			.setHTML('<span class="value-popup">Outside domain</span>')
			.addTo(map);
	} else {
		popup.addTo(map);
	}

	const { value } = getValueFromLatLong(
		coordinates.lat,
		coordinates.lng,
		rasterManager?.getActiveSourceUrl() ?? ''
	);

	if (isFinite(value)) {
		const isDark = mode.current === 'dark';
		const colorScale = getColorScale(get(v), isDark, omProtocolSettings.colorScales);
		const color = getColor(colorScale, value);
		popup
			.setLngLat(coordinates)
			.setHTML(
				`<div style="font-weight:bold;background-color:rgba(${color.join(',')});color:${textWhite(color, isDark) ? 'white' : 'black'};" class="popup-div">` +
					`<span class="popup-value">${value.toFixed(1)}</span>${colorScale.unit}</div>`
			);
	} else {
		popup
			.setLngLat(coordinates)
			.setHTML('<span style="padding:3px 5px;" class="popup-string">Outside domain</span>');
	}
};

const updatePopup = (e: maplibregl.MapMouseEvent): void => {
	popupCoordinates = e.lngLat;
	renderPopup(e.lngLat);
};

export const refreshPopup = (): void => {
	if (popupCoordinates) renderPopup(popupCoordinates);
};

export const addPopup = (): void => {
	if (!map) return;

	map.on('mousemove', updatePopup);
	map.on('click', (e: maplibregl.MapMouseEvent) => {
		if (!map) return;
		showPopup = !showPopup;
		if (!showPopup) popup?.remove();
		if (showPopup) popup?.setLngLat(e.lngLat).addTo(map);
		updatePopup(e);
	});
};

export const reloadStyles = () => {
	getStyle().then((style) => {
		if (!map) return;
		map.setStyle(style);
		map.once('styledata', () => {
			setTimeout(() => {
				addOmFileLayers();
				addHillshadeSources();
				if (preferences.hillshade) {
					addHillshadeLayer();
				}
			}, 50);
		});
	});
};
