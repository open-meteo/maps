import { get } from 'svelte/store';

import { GridFactory, isSeamlessDomain, resolveConcreteDomain } from '@openmeteo/weather-map-layer';
import * as maplibregl from 'maplibre-gl';
import { mode } from 'mode-watcher';
import { toast } from 'svelte-sonner';

import { map as m } from '$lib/stores/map';
import { loading, opacity, preferences as p } from '$lib/stores/preferences';
import { selectedDomain } from '$lib/stores/variables';
import { vectorOptions as vO } from '$lib/stores/vector';

import {
	BEFORE_LAYER_RASTER,
	BEFORE_LAYER_VECTOR,
	BEFORE_LAYER_VECTOR_WATER_CLIP,
	HILLSHADE_LAYER
} from '$lib/constants';
import { type SlotLayer, SlotManager } from '$lib/slot-manager';

import { refreshPopup } from './popup';
import { omProtocolSettings } from './stores/om-protocol-settings';
import { currentOmUrl } from './stores/om-url';
import { getOMUrl } from './url';

// =============================================================================
// Expression helpers
// =============================================================================

const isDark = (): boolean => mode.current === 'dark';
const lightOrDark = (light: string, dark: string): string => (isDark() ? dark : light);

const getRasterOpacity = (): number => {
	const opacityValue = get(opacity) / 100;
	return isDark() ? Math.max(0, (opacityValue * 100 - 10) / 100) : opacityValue;
};

const makeArrowColor = (): maplibregl.ExpressionSpecification => {
	let expr: maplibregl.ExpressionSpecification = [
		'literal',
		lightOrDark('rgba(0,0,0, 0.2)', 'rgba(255,255,255, 0.2)')
	];
	const thresholds: [number, string, string][] = [
		[2, 'rgba(0,0,0, 0.3)', 'rgba(255,255,255, 0.3)'],
		[3, 'rgba(0,0,0, 0.4)', 'rgba(255,255,255, 0.4)'],
		[4, 'rgba(0,0,0, 0.5)', 'rgba(255,255,255, 0.5)'],
		[5, 'rgba(0,0,0, 0.6)', 'rgba(255,255,255, 0.6)'],
		[10, 'rgba(0,0,0, 0.7)', 'rgba(255,255,255, 0.7)']
	];
	for (const [threshold, light, dark] of [...thresholds]) {
		expr = [
			'case',
			['boolean', ['>', ['to-number', ['get', 'value']], threshold], false],
			lightOrDark(light, dark),
			expr
		];
	}
	return expr;
};

const makeArrowWidth = (): maplibregl.ExpressionSpecification => [
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

const makeContourColor = (): maplibregl.ExpressionSpecification => [
	'case',
	['boolean', ['==', ['%', ['to-number', ['get', 'value']], 100], 0], false],
	lightOrDark('rgba(0,0,0, 0.6)', 'rgba(255,255,255, 0.8)'),
	[
		'case',
		['boolean', ['==', ['%', ['to-number', ['get', 'value']], 50], 0], false],
		lightOrDark('rgba(0,0,0, 0.5)', 'rgba(255,255,255, 0.7)'),
		[
			'case',
			['boolean', ['==', ['%', ['to-number', ['get', 'value']], 10], 0], false],
			lightOrDark('rgba(0,0,0, 0.4)', 'rgba(255,255,255, 0.6)'),
			lightOrDark('rgba(0,0,0, 0.3)', 'rgba(255,255,255, 0.5)')
		]
	]
];

const makeContourWidth = (): maplibregl.ExpressionSpecification => [
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
		const vectorOptions = get(vO);
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
					'line-color': makeArrowColor(),
					'line-width': makeArrowWidth()
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
		const vectorOptions = get(vO);
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
		const vectorOptions = get(vO);
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
					'line-color': makeContourColor(),
					'line-width': makeContourWidth()
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
		const vectorOptions = get(vO);
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
					'text-color': lightOrDark('rgba(0,0,0, 0.7)', 'rgba(255,255,255, 0.8)')
				}
			},
			beforeLayer
		);
	}
});

// =============================================================================
// Manager instances
// =============================================================================

export let rasterManager: SlotManager | undefined;
export let vectorManager: SlotManager | undefined;

export const createManagers = (): void => {
	const map = get(m);
	if (!map) return;

	const preferences = get(p);

	rasterManager = new SlotManager(map, {
		sourceIdPrefix: 'omRasterSource',
		beforeLayer: preferences.hillshade ? HILLSHADE_LAYER : BEFORE_LAYER_RASTER,
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
// Seamless domain border overlay
// =============================================================================

const SEAMLESS_BORDER_SOURCE_ID = 'seamlessBorderSource';

const removeSeamlessBorderLayer = (): void => {
	const map = get(m);
	if (!map) return;
	// Collect IDs first to avoid mutating the layer list while iterating
	const toRemove = (map.getStyle()?.layers ?? [])
		.map((l) => l.id)
		.filter((id) => id.startsWith('seamless-border-'));
	for (const id of toRemove) {
		if (map.getLayer(id)) map.removeLayer(id);
	}
	if (map.getSource(SEAMLESS_BORDER_SOURCE_ID)) map.removeSource(SEAMLESS_BORDER_SOURCE_ID);
};

export const updateSeamlessBorderLayer = (): void => {
	const map = get(m);
	if (!map) return;

	removeSeamlessBorderLayer();

	const preferences = get(p);
	if (!preferences.showSeamlessBorders) return;

	const domain = get(selectedDomain);
	if (!isSeamlessDomain(domain)) return; // Not a seamless domain — nothing to draw

	const seamlessDomain = domain;
	const settings = get(omProtocolSettings);

	// Build a bounding-box polygon for each sub-layer except the global fallback
	// (last layer), which covers the whole world and needs no border.
	const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
	for (let i = 0; i < seamlessDomain.layers.length - 1; i++) {
		const layer = seamlessDomain.layers[i];
		const concreteDomain = resolveConcreteDomain(layer.domainValue, settings.domainOptions);
		if (!concreteDomain) continue;

		const [minLon, minLat, maxLon, maxLat] = GridFactory.create(
			concreteDomain.grid,
			null
		).getBounds();
		features.push({
			type: 'Feature',
			geometry: {
				type: 'Polygon',
				coordinates: [
					[
						[minLon, minLat],
						[maxLon, minLat],
						[maxLon, maxLat],
						[minLon, maxLat],
						[minLon, minLat]
					]
				]
			},
			properties: {
				layerIndex: i,
				minZoom: layer.minZoom,
				label: concreteDomain.label ?? concreteDomain.value
			}
		});
	}

	if (features.length === 0) return;

	map.addSource(SEAMLESS_BORDER_SOURCE_ID, {
		type: 'geojson',
		data: { type: 'FeatureCollection', features }
	});

	// Add one line + one symbol MapLibre layer per boundary so each can carry its
	// own zoom-dependent opacity that fades in 2 zoom levels before the sub-domain
	// becomes active (i.e. when its minZoom threshold is reached by the user).
	const lineColor = isDark() ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)';
	const textColor = isDark() ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.75)';
	const textHalo = isDark() ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';

	for (const feature of features) {
		const i = feature.properties!.layerIndex as number;
		const minZoom = feature.properties!.minZoom as number;
		// Start fading in 2 zoom levels before the layer becomes active
		const fadeStart = Math.max(0, minZoom - 2);

		// When fadeStart === minZoom (only theoretically possible at minZoom 0),
		// skip the interpolation and show at full opacity immediately.
		const opacityExpr: maplibregl.ExpressionSpecification | number =
			fadeStart < minZoom
				? (['interpolate', ['linear'], ['zoom'], fadeStart, 0, minZoom, 1] as const)
				: 1;

		// Dashed bounding-box border
		map.addLayer(
			{
				id: `seamless-border-line-${i}`,
				type: 'line',
				source: SEAMLESS_BORDER_SOURCE_ID,
				minzoom: fadeStart,
				filter: ['==', ['get', 'layerIndex'], i],
				paint: {
					'line-color': lineColor,
					'line-width': 1.5,
					'line-dasharray': [4, 3],
					'line-opacity': opacityExpr
				}
			},
			BEFORE_LAYER_VECTOR
		);

		// Domain name label placed along the border line
		map.addLayer(
			{
				id: `seamless-border-label-${i}`,
				type: 'symbol',
				source: SEAMLESS_BORDER_SOURCE_ID,
				minzoom: fadeStart,
				filter: ['==', ['get', 'layerIndex'], i],
				layout: {
					'text-field': ['get', 'label'],
					'text-size': 11,
					'symbol-placement': 'line',
					'symbol-spacing': 400,
					'text-rotation-alignment': 'map',
					'text-offset': [0, -0.8],
					'text-allow-overlap': false,
					'text-ignore-placement': true
				},
				paint: {
					'text-color': textColor,
					'text-halo-color': textHalo,
					'text-halo-width': 1.5,
					'text-opacity': opacityExpr
				}
			},
			BEFORE_LAYER_VECTOR
		);
	}
};

// =============================================================================
// Public layer API
// =============================================================================

export const addOmFileLayers = (): void => {
	const map = get(m);
	if (!map) return;
	const omUrl = getOMUrl();
	createManagers();
	rasterManager?.update('om://' + omUrl);
	vectorManager?.update('om://' + omUrl);
	updateSeamlessBorderLayer();
};

export const changeOMfileURL = (vectorOnly = false, rasterOnly = false): void => {
	const map = get(m);
	if (!map) return;

	const omUrl = getOMUrl();
	if (get(currentOmUrl) == omUrl || !omUrl) return;
	currentOmUrl.set(omUrl);

	loading.set(true);

	const preferences = get(p);
	vectorManager?.setBeforeLayer(
		preferences.clipWater ? BEFORE_LAYER_VECTOR_WATER_CLIP : BEFORE_LAYER_VECTOR
	);
	rasterManager?.setBeforeLayer(preferences.hillshade ? HILLSHADE_LAYER : BEFORE_LAYER_RASTER);

	if (!vectorOnly) rasterManager?.update('om://' + omUrl);
	if (!rasterOnly) vectorManager?.update('om://' + omUrl);
	updateSeamlessBorderLayer();
};
