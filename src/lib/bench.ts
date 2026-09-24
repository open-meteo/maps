import { writable } from 'svelte/store';

import { getValueFromLatLong } from '@openmeteo/weather-map-layer';
import { persisted } from 'svelte-persisted-store';

/** Show the grid benchmark overlay (see components/bench/grid-bench.svelte). */
export const showGridBench = persisted('grid-bench', false);

export interface GridBenchStats {
	/** loading the grid's geometry (warp table or cell index) */
	geometryMs?: number;
	/** tiles requested before their data had arrived: download + render */
	loadCount: number;
	loadMs: number[];
	/** tiles requested once the data was there: render, including the worker queue */
	renderCount: number;
	renderMs: number[];
	popupMs?: number;
}

const HISTORY = 200;

/** Timings per domain value, keyed as in the om:// URL path. */
export const gridBench = writable<Record<string, GridBenchStats>>({});

// when the first tile of a source (file + parameters) resolved, i.e. its data
// was available from then on
const dataReadyAt = new Map<string, number>();

const domainOf = (url: string): string | undefined => url.match(/\/data_spatial\/([^/]+)\//)?.[1];

const update = (domain: string | undefined, apply: (stats: GridBenchStats) => void) => {
	if (!domain) return;
	gridBench.update((all) => {
		const stats = all[domain] ?? { loadCount: 0, loadMs: [], renderCount: 0, renderMs: [] };
		apply(stats);
		return { ...all, [domain]: stats };
	});
};

const push = (history: number[], ms: number) => [...history.slice(-(HISTORY - 1)), ms];

export const recordGeometry = (domain: string, ms: number): void =>
	update(domain, (stats) => {
		stats.geometryMs = ms;
	});

/** Records one om:// protocol request; cancelled requests carry no timing. */
export const recordRequest = (
	url: string,
	type: string | undefined,
	start: number,
	end: number,
	cancelled: boolean
): void => {
	if (cancelled) return;
	const domain = domainOf(url);
	if (type === 'json') {
		// the TileJSON request loads the geometry of a domain selected at runtime
		update(domain, (stats) => {
			if (stats.geometryMs === undefined) stats.geometryMs = end - start;
		});
		return;
	}
	if (type !== 'image') return;
	const source = url.replace(/\/\d+\/\d+\/\d+$/, '');
	const ready = dataReadyAt.get(source);
	if (ready === undefined) dataReadyAt.set(source, end);
	const afterLoad = ready !== undefined && start >= ready;
	update(domain, (stats) => {
		if (afterLoad) {
			stats.renderCount++;
			stats.renderMs = push(stats.renderMs, end - start);
		} else {
			stats.loadCount++;
			stats.loadMs = push(stats.loadMs, end - start);
		}
	});
};

/** The popup's point lookup, timed. */
export const timedValueFromLatLong = async (
	lat: number,
	lng: number,
	omUrl: string
): ReturnType<typeof getValueFromLatLong> => {
	const start = performance.now();
	const result = await getValueFromLatLong(lat, lng, omUrl);
	update(domainOf(omUrl), (stats) => {
		stats.popupMs = performance.now() - start;
	});
	return result;
};

export const median = (values: number[]): number | undefined => {
	if (values.length === 0) return undefined;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
};
