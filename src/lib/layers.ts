import { get } from 'svelte/store';

import * as maplibregl from 'maplibre-gl';
import { mode } from 'mode-watcher';
import { toast } from 'svelte-sonner';

import { map as m } from '$lib/stores/map';
import { loading, opacity, preferences as p } from '$lib/stores/preferences';
import { vectorOptions as vO } from '$lib/stores/vector';

import {
	BEFORE_LAYER_RASTER,
	BEFORE_LAYER_VECTOR,
	BEFORE_LAYER_VECTOR_WATER_CLIP
} from '$lib/constants';
import { type SlotLayer, SlotManager } from '$lib/slot-manager';

import { refreshPopup } from './popup';
import { getOMUrl } from './url';

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

export let rasterManager: SlotManager | undefined;
export let vectorManager: SlotManager | undefined;

export const createManagers = (): void => {
	const map = get(m);
	if (!map) return;

	const preferences = get(p);

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
	const map = get(m);
	if (!map) return;
	const omUrl = getOMUrl();
	createManagers();
	rasterManager?.update('om://' + omUrl);
	vectorManager?.update('om://' + omUrl);
};

export const changeOMfileURL = (vectorOnly = false, rasterOnly = false): void => {
	const map = get(m);
	if (!map) return;
	loading.set(true);
	const omUrl = getOMUrl();

	const preferences = get(p);
	const beforeLayer = preferences.clipWater ? BEFORE_LAYER_VECTOR_WATER_CLIP : BEFORE_LAYER_VECTOR;
	vectorManager?.setBeforeLayer(beforeLayer);

	if (!vectorOnly) rasterManager?.update('om://' + omUrl);
	if (!rasterOnly) vectorManager?.update('om://' + omUrl);
};
