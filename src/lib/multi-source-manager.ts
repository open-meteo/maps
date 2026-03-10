/**
 * MultiSourceManager: orchestrates multiple SlotManager pairs so that a
 * chart preset with N sources can render N independent raster+vector layer
 * stacks on the same map.
 *
 * Each source gets its own raster SlotManager (if `source.raster` is true)
 * and its own vector SlotManager (if `source.contours` or `source.arrows`
 * is true), with unique source-id prefixes so they don't collide.
 */
import { get } from 'svelte/store';

import * as maplibregl from 'maplibre-gl';
import { mode } from 'mode-watcher';
import { toast } from 'svelte-sonner';

import { map as m } from '$lib/stores/map';
import { loading, opacity, preferences as p, tileSize as tS } from '$lib/stores/preferences';
import { modelRun as mR, time } from '$lib/stores/time';
import { domain as d } from '$lib/stores/variables';

import {
	type ArrowStyle,
	type ContourStyle,
	buildArrowColorExpr,
	buildArrowWidthExpr,
	buildContourColorExpr,
	buildContourWidthExpr,
	defaultArrowStyle,
	defaultContourStyle
} from './chart-styles';
import {
	BEFORE_LAYER_RASTER,
	BEFORE_LAYER_VECTOR,
	BEFORE_LAYER_VECTOR_WATER_CLIP,
	HILLSHADE_LAYER
} from './constants';
import { fmtModelRun, fmtSelectedTime, getBaseUri } from './helpers';
import { refreshPopup } from './popup';
import { type SlotLayer, SlotManager } from './slot-manager';
import { customArrowStyles, customContourStyles } from './stores/chart-styles';

import type { ChartSource } from './chart-presets';

// ── expression helpers ──────────────────────────────────────────────────

const isDark = (): boolean => mode.current === 'dark';
const lightOrDark = (light: string, dark: string): string => (isDark() ? dark : light);

const getRasterOpacity = (): number => {
	const opacityValue = get(opacity) / 100;
	return isDark() ? Math.max(0, (opacityValue * 100 - 10) / 100) : opacityValue;
};

// ── layer factories ─────────────────────────────────────────────────────

const rasterLayer = (prefix: string): SlotLayer => ({
	id: `${prefix}_raster`,
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

const arrowLayer = (prefix: string, style: ArrowStyle): SlotLayer => ({
	id: `${prefix}_arrow`,
	opacityProp: 'line-opacity',
	commitOpacity: 1,
	add: (map, sourceId, layerId, beforeLayer) => {
		map.addLayer(
			{
				id: layerId,
				type: 'line',
				source: sourceId,
				'source-layer': 'wind-arrows',
				paint: {
					'line-opacity': 0,
					'line-opacity-transition': { duration: 200, delay: 0 },
					'line-color': buildArrowColorExpr(style, isDark()),
					'line-width': buildArrowWidthExpr(style)
				},
				layout: { 'line-cap': 'round' }
			},
			beforeLayer
		);
	}
});

const contourLineLayer = (prefix: string, style: ContourStyle): SlotLayer => ({
	id: `${prefix}_contour`,
	opacityProp: 'line-opacity',
	commitOpacity: 1,
	add: (map, sourceId, layerId, beforeLayer) => {
		map.addLayer(
			{
				id: layerId,
				type: 'line',
				source: sourceId,
				'source-layer': 'contours',
				paint: {
					'line-opacity': 0,
					'line-opacity-transition': { duration: 200, delay: 0 },
					'line-color': buildContourColorExpr(style, isDark()),
					'line-width': buildContourWidthExpr(style)
				}
			},
			beforeLayer
		);
	}
});

const contourLabelLayer = (prefix: string): SlotLayer => ({
	id: `${prefix}_contourLabel`,
	opacityProp: 'text-opacity',
	commitOpacity: 1,
	add: (map, sourceId, layerId, beforeLayer) => {
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

// ── OM URL builder for a specific variable ──────────────────────────────

function buildOmUrl(source: ChartSource): string {
	const domain = get(d);
	const base = `${getBaseUri(domain)}/data_spatial/${domain}`;
	const modelRun = get(mR) as Date;
	const selectedTime = get(time);

	let result = `${base}/${fmtModelRun(modelRun)}/${fmtSelectedTime(selectedTime)}.om`;
	result += `?variable=${source.variable}`;

	if (isDark()) result += '&dark=true';
	if (source.contours) result += '&contours=true';
	if (source.contours && source.contourInterval) result += `&intervals=${source.contourInterval}`;
	if (source.arrows) result += '&arrows=true';

	const tileSize = get(tS);
	if (tileSize !== 256) result += `&tile_size=${tileSize}`;

	return result;
}

// ── per-source manager pair ─────────────────────────────────────────────

interface SourceManagers {
	raster?: SlotManager;
	vector?: SlotManager;
}

// ── public API ──────────────────────────────────────────────────────────

let activeManagers: SourceManagers[] = [];
let activeSources: ChartSource[] = [];

/** Destroy all active multi-source managers. */
export function destroyMultiSource(): void {
	for (const mgr of activeManagers) {
		mgr.raster?.destroy();
		mgr.vector?.destroy();
	}
	activeManagers = [];
	activeSources = [];
}

/** Returns true when multi-source layers are currently active. */
export function isMultiSourceActive(): boolean {
	return activeManagers.length > 0;
}

/**
 * Returns the active OM URLs for each source manager, along with
 * the corresponding variable name. Used by the popup to read values from
 * all visible layers. Checks raster first, falls back to vector.
 */
export function getMultiSourceUrls(): Array<{ url: string; variable: string; raster: boolean }> {
	const result: Array<{ url: string; variable: string; raster: boolean }> = [];
	for (let i = 0; i < activeManagers.length; i++) {
		const mgr = activeManagers[i];
		const src = activeSources[i];
		if (!src) continue;
		const url = mgr.raster?.getActiveSourceUrl() ?? mgr.vector?.getActiveSourceUrl();
		if (url) result.push({ url, variable: src.variable, raster: !!src.raster });
	}
	return result;
}

/**
 * Apply a set of chart sources to the map. Creates one SlotManager pair per
 * source and triggers an initial load.
 */
export function applyChartSources(sources: ChartSource[]): void {
	const map = get(m);
	if (!map) return;

	// Tear down any previous multi-source layers
	destroyMultiSource();
	activeSources = sources;

	const preferences = get(p);

	// Collect all individual SlotManagers for coordinated commit
	const allManagers: SlotManager[] = [];

	loading.set(true);

	/** Called each time a manager signals its tiles are loaded. When every
	 *  manager is ready, flush all commits simultaneously so layers fade in
	 *  together instead of one-by-one. */
	const onReady = () => {
		if (allManagers.every((mgr) => mgr.isReady())) {
			for (const mgr of allManagers) mgr.commitNow();
			loading.set(false);
			refreshPopup();
		}
	};
	const onError = () => loading.set(false);

	for (let i = 0; i < sources.length; i++) {
		const source = sources[i];
		const prefix = `chart_${i}`;
		const mgr: SourceManagers = {};

		if (source.raster) {
			mgr.raster = new SlotManager(map, {
				sourceIdPrefix: `${prefix}_raster`,
				beforeLayer: preferences.hillshade ? HILLSHADE_LAYER : BEFORE_LAYER_RASTER,
				layerFactory: () => [rasterLayer(prefix)],
				sourceSpec: (url) => ({ url, type: 'raster', maxzoom: 14 }),
				removeDelayMs: 300,
				deferCommit: true,
				onReady,
				onError,
				slowLoadWarningMs: 10000,
				onSlowLoad: () =>
					toast.warning(
						'Loading raster data might be limited by bandwidth or upstream server speed.'
					)
			});
			allManagers.push(mgr.raster);
		}

		if (source.contours || source.arrows) {
			mgr.vector = new SlotManager(map, {
				sourceIdPrefix: `${prefix}_vector`,
				beforeLayer: preferences.clipWater ? BEFORE_LAYER_VECTOR_WATER_CLIP : BEFORE_LAYER_VECTOR,
				layerFactory: () => {
					const result: SlotLayer[] = [];
					const aStyle = get(customArrowStyles)[source.variable] ?? defaultArrowStyle;
					const cStyle = get(customContourStyles)[source.variable] ?? defaultContourStyle;
					if (source.arrows) result.push(arrowLayer(prefix, aStyle));
					if (source.contours) {
						result.push(contourLineLayer(prefix, cStyle));
						result.push(contourLabelLayer(prefix));
					}
					return result;
				},
				sourceSpec: (url) => ({ url, type: 'vector' }),
				removeDelayMs: 250,
				deferCommit: true,
				onReady,
				onError
			});
			allManagers.push(mgr.vector);
		}

		activeManagers.push(mgr);
	}

	// Trigger initial load for every manager
	updateMultiSource(sources);
}

/**
 * Update all active multi-source managers with fresh URLs (e.g. after a
 * time-step change). The `sources` array must match the one passed to
 * `applyChartSources`.
 */
export function updateMultiSource(sources: ChartSource[]): void {
	loading.set(true);
	for (let i = 0; i < activeManagers.length; i++) {
		const source = sources[i];
		const url = 'om://' + buildOmUrl(source);
		activeManagers[i].raster?.update(url);
		activeManagers[i].vector?.update(url);
	}
}
