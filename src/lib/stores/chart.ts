import { derived, get } from 'svelte/store';

import { variableHasDirections } from '@openmeteo/weather-map-layer';
import { persisted } from 'svelte-persisted-store';

import { cloneSources, matchPreset, sourcesEqual } from '$lib/chart-encoding';
import { getChartPreset } from '$lib/chart-presets';
import { DEFAULT_VARIABLE } from '$lib/constants';

import { variable } from './variables';
import { vectorOptions } from './vector';

import type { ChartSource, ChartState, SavedChart } from '$lib/chart-types';

interface SavedChartsState {
	version: 1;
	charts: SavedChart[];
}

/** A source with every layer type toggled off draws nothing on the map. */
export const sourceDrawsSomething = (source: ChartSource): boolean =>
	!!(source.raster || source.contours || source.arrows);

/**
 * First raster source, else the first source drawing anything, else the first
 * source: drives legend, popup, prefetch.
 */
export const pickPrimarySource = (chart: ChartState): ChartSource =>
	chart.sources.find((source) => source.raster) ??
	chart.sources.find(sourceDrawsSomething) ??
	chart.sources[0];

/** Variable of the primary source. */
export const pickPrimaryVariable = (chart: ChartState): string => pickPrimarySource(chart).variable;

/** A single-source chart for `v`, applying the persisted vector defaults. */
export const plainChartFor = (v: string): ChartState => {
	const vo = get(vectorOptions);
	const source: ChartSource = { variable: v, raster: true };
	if (vo.contours) {
		source.contours = true;
		if (!vo.breakpoints) source.contourInterval = vo.contourInterval;
	}
	// Arrows follow the settings toggle, wherever the variable can provide
	// directions (ignoring vo.arrows here would make the toggle a no-op)
	if (vo.arrows && variableHasDirections(v)) source.arrows = true;
	return chartFromSources([source]);
};

export const defaultChart = (): ChartState => plainChartFor(DEFAULT_VARIABLE);

/**
 * Build the chart state for `sources`, labelled with the preset or saved
 * chart they match exactly. Labels are never carried over: a chart's identity
 * is its source list, so any edit must re-derive presetId/name from scratch.
 */
const chartFromSources = (sources: ChartSource[]): ChartState => {
	const chart: ChartState = { sources };
	const preset = matchPreset(sources);
	if (preset) chart.presetId = preset.id;
	const saved = get(savedCharts).charts.find((c) => sourcesEqual(c.sources, sources));
	if (saved) chart.name = saved.name;
	return chart;
};

export const savedCharts = persisted<SavedChartsState>('saved-charts', {
	version: 1,
	charts: []
});

export const activeChart = persisted<ChartState>('active-chart', plainChartFor(get(variable)));

export const chartSources = derived(activeChart, (chart) => chart.sources);

// ── Sync with the legacy single-variable store ──────────────────────────
// `variable` stays the primary variable of the chart, so level derivations,
// legend, popup and prefetch keep working. Equality guards break the loop.

activeChart.subscribe((chart) => {
	const primary = pickPrimaryVariable(chart);
	if (get(variable) !== primary) variable.set(primary);
});

variable.subscribe((v) => {
	if (pickPrimaryVariable(get(activeChart)) !== v) activeChart.set(plainChartFor(v));
});

// ── Actions ─────────────────────────────────────────────────────────────

export const setPlainVariable = (v: string): void => {
	activeChart.set(plainChartFor(v));
};

/** Replace the chart sources wholesale (URL parsing, domain-switch pruning). */
export const setSources = (sources: ChartSource[]): void => {
	activeChart.set(chartFromSources(cloneSources(sources)));
};

/**
 * Re-apply the persisted vector defaults (settings sheet contour toggles) to
 * the active chart. Only plain-ish charts follow the defaults; presets and
 * saved charts keep their per-source configuration.
 */
export const applyVectorDefaultsToActiveChart = (): void => {
	const chart = get(activeChart);
	if (chart.sources.length !== 1 || chart.presetId || chart.name) return;
	activeChart.set(plainChartFor(chart.sources[0].variable));
};

/**
 * Settings sheet contour switch: toggle contours on every source, the way the
 * arrows switch below does. A source left drawing nothing is fine; that is a
 * state the chart editor can produce too.
 */
export const setContoursOnActiveChart = (enabled: boolean): void => {
	const chart = get(activeChart);
	const vo = get(vectorOptions);
	const sources = cloneSources(chart.sources);
	let changed = false;
	for (const source of sources) {
		if (!!source.contours === enabled) continue;
		source.contours = enabled || undefined;
		source.contourInterval = enabled && !vo.breakpoints ? vo.contourInterval : undefined;
		changed = true;
	}
	if (changed) activeChart.set(chartFromSources(sources));
};

/** Settings sheet arrows switch: toggle arrows on every capable source. */
export const setArrowsOnActiveChart = (enabled: boolean): void => {
	const chart = get(activeChart);
	const sources = cloneSources(chart.sources);
	let changed = false;
	for (const source of sources) {
		const arrows = enabled && variableHasDirections(source.variable);
		if (!!source.arrows !== arrows) {
			source.arrows = arrows || undefined;
			changed = true;
		}
	}
	if (changed) activeChart.set(chartFromSources(sources));
};

/**
 * True when the chart is one variable's own chart, whatever per-source styling
 * it carries: a preset's opacity, for instance, survives removing the other
 * source. The selection panel reads this as "this variable is selected", for
 * its highlight and its level selector; writing `variable=` to the URL needs
 * the stricter `isDefaultsPlainChart` below, since styling would be lost.
 */
export const isSingleVariableChart = (chart: ChartState): boolean =>
	chart.sources.length === 1 && !chart.sources[0].domain;

/**
 * True when the chart is exactly what picking its primary variable from the
 * variable list would produce, i.e. representable by the legacy `variable`
 * URL param plus the persisted vector defaults.
 */
export const isDefaultsPlainChart = (chart: ChartState): boolean =>
	chart.sources.length === 1 &&
	sourcesEqual(chart.sources, plainChartFor(chart.sources[0].variable).sources);

export const applyPreset = (id: string): void => {
	const preset = getChartPreset(id);
	if (!preset) return;
	activeChart.set(chartFromSources(cloneSources(preset.sources)));
};

export const applySavedChart = (id: string): void => {
	const saved = get(savedCharts).charts.find((chart) => chart.id === id);
	if (!saved) return;
	activeChart.set(chartFromSources(cloneSources(saved.sources)));
};

export const updateSource = (index: number, patch: Partial<ChartSource>): void => {
	const chart = get(activeChart);
	const sources = cloneSources(chart.sources);
	if (!sources[index]) return;
	const next = { ...sources[index], ...patch };
	// Source variables must stay unique (the editor keys rows by them): a
	// level change that collides with an existing source drops the edit
	if (sources.some((source, i) => i !== index && source.variable === next.variable)) return;
	sources[index] = next;
	activeChart.set(chartFromSources(sources));
};

export const addSource = (v: string): void => {
	const chart = get(activeChart);
	if (chart.sources.some((source) => source.variable === v)) return;
	const sources = cloneSources(chart.sources);
	const arrows = get(vectorOptions).arrows && variableHasDirections(v);
	// Second field defaults to contours when a raster fill is already shown,
	// except for variables carrying directions: those default to arrows
	const source: ChartSource = sources.some((s) => s.raster)
		? arrows
			? { variable: v, arrows: true }
			: { variable: v, contours: true }
		: { variable: v, raster: true };
	if (arrows) source.arrows = true;
	sources.push(source);
	activeChart.set(chartFromSources(sources));
};

export const removeSource = (index: number): void => {
	const chart = get(activeChart);
	if (chart.sources.length <= 1 || !chart.sources[index]) return;
	const sources = cloneSources(chart.sources);
	sources.splice(index, 1);
	activeChart.set(chartFromSources(sources));
};

export const saveCurrentChart = (name: string): void => {
	const trimmed = name.trim();
	if (!trimmed) return;
	const chart = get(activeChart);
	const saved: SavedChart = {
		id: `${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`,
		name: trimmed,
		sources: cloneSources(chart.sources),
		createdAt: Date.now()
	};
	savedCharts.update((state) => ({ ...state, charts: [...state.charts, saved] }));
	activeChart.set(chartFromSources(chart.sources));
};

export const deleteSavedChart = (id: string): void => {
	savedCharts.update((state) => ({
		...state,
		charts: state.charts.filter((chart) => chart.id !== id)
	}));
	// Drop a now-dangling name label on the active chart
	activeChart.set(chartFromSources(get(activeChart).sources));
};
