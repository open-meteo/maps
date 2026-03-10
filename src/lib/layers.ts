import { get } from 'svelte/store';

import { mode } from 'mode-watcher';
import { toast } from 'svelte-sonner';

import { customArrowStyles, customContourStyles } from '$lib/stores/chart-styles';
import { map as m } from '$lib/stores/map';
import { loading, opacity, preferences as p } from '$lib/stores/preferences';
import { vectorOptions as vO } from '$lib/stores/vector';

import {
	buildArrowColorExpr,
	buildArrowWidthExpr,
	buildContourColorExpr,
	buildContourWidthExpr,
	defaultArrowStyle,
	defaultContourStyle
} from '$lib/chart-styles';
import {
	BEFORE_LAYER_RASTER,
	BEFORE_LAYER_VECTOR,
	BEFORE_LAYER_VECTOR_WATER_CLIP,
	HILLSHADE_LAYER
} from '$lib/constants';
import { type SlotLayer, SlotManager } from '$lib/slot-manager';

import { destroyMultiSource, updateMultiSource } from './multi-source-manager';
import { refreshPopup } from './popup';
import { activeChartSources } from './stores/chart';
import { currentOmUrl } from './stores/om-url';
import { variable as currentVariable } from './stores/variables';
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

const getArrowStyle = () => get(customArrowStyles)[get(currentVariable)] ?? defaultArrowStyle;
const getContourStyle = () => get(customContourStyles)[get(currentVariable)] ?? defaultContourStyle;

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
					'line-color': buildArrowColorExpr(getArrowStyle(), isDark()),
					'line-width': buildArrowWidthExpr(getArrowStyle())
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
					'line-color': buildContourColorExpr(getContourStyle(), isDark()),
					'line-width': buildContourWidthExpr(getContourStyle())
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

/** Tear down single-source managers so they don't conflict with multi-source. */
export const destroySingleSource = (): void => {
	rasterManager?.destroy();
	vectorManager?.destroy();
	rasterManager = undefined;
	vectorManager = undefined;
};

/** Re-activate single-source mode (called when leaving a chart preset). */
export const restoreSingleSource = (): void => {
	destroyMultiSource();
	// Reset currentOmUrl so changeOMfileURL doesn't skip the update
	currentOmUrl.set('');
	addOmFileLayers();
};

export const changeOMfileURL = (vectorOnly = false, rasterOnly = false): void => {
	const map = get(m);
	if (!map) return;

	// When chart sources are active, delegate to the multi-source manager
	const sources = get(activeChartSources);
	if (sources) {
		loading.set(true);
		updateMultiSource(sources);
		return;
	}

	// Safety: if single-source managers don't exist yet, skip
	if (!rasterManager && !vectorManager) return;

	const omUrl = getOMUrl();
	if (get(currentOmUrl) == omUrl) return;
	currentOmUrl.set(omUrl);

	loading.set(true);

	const preferences = get(p);
	vectorManager?.setBeforeLayer(
		preferences.clipWater ? BEFORE_LAYER_VECTOR_WATER_CLIP : BEFORE_LAYER_VECTOR
	);
	rasterManager?.setBeforeLayer(preferences.hillshade ? HILLSHADE_LAYER : BEFORE_LAYER_RASTER);

	if (!vectorOnly) rasterManager?.update('om://' + omUrl);
	if (!rasterOnly) vectorManager?.update('om://' + omUrl);
};
