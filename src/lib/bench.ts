import { get, writable } from 'svelte/store';

import { type RenderedTile, getValueFromLatLong } from '@openmeteo/weather-map-layer';
import { persisted } from 'svelte-persisted-store';

/** Show the grid benchmark overlay (see components/bench/grid-bench.svelte). */
export const showGridBench = persisted('grid-bench', false);

export interface GridBenchStats {
	/** loading the grid's geometry (warp table or cell index) */
	geometryMs?: number;
	/** tile requests end to end: data download, worker queue and render */
	requestCount: number;
	requestMs: number[];
	/** time the workers spent rendering tiles */
	renderCount: number;
	renderMs: number[];
	popupMs?: number;
}

const HISTORY = 200;
// tiles of one view arrive in a burst; a pause this long starts a new batch
const BATCH_GAP_MS = 300;
const LOGGED_PER_BATCH = 3;

/** Timings per domain value, keyed as in the om:// URL path. */
export const gridBench = writable<Record<string, GridBenchStats>>({});

const domainOf = (url: string): string | undefined => url.match(/\/data_spatial\/([^/]+)\//)?.[1];

const update = (domain: string | undefined, apply: (stats: GridBenchStats) => void) => {
	if (!domain) return;
	gridBench.update((all) => {
		const stats = all[domain] ?? { requestCount: 0, requestMs: [], renderCount: 0, renderMs: [] };
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
	ms: number,
	cancelled: boolean
): void => {
	if (cancelled) return;
	const domain = domainOf(url);
	if (type === 'json') {
		// the TileJSON request loads the geometry of a domain selected at runtime
		update(domain, (stats) => {
			if (stats.geometryMs === undefined) stats.geometryMs = ms;
		});
	} else if (type === 'image') {
		update(domain, (stats) => {
			stats.requestCount++;
			stats.requestMs = push(stats.requestMs, ms);
		});
	}
};

let lastRender = 0;
let loggedInBatch = 0;

/**
 * A tile the worker finished, with its own render time. The first few tiles of
 * every batch are also logged to the console while the overlay is shown.
 */
export const recordRender = (tile: RenderedTile): void => {
	const now = performance.now();
	if (now - lastRender > BATCH_GAP_MS) loggedInBatch = 0;
	lastRender = now;
	if (tile.type === 'image') {
		update(tile.domain, (stats) => {
			stats.renderCount++;
			stats.renderMs = push(stats.renderMs, tile.renderMs);
		});
	}
	if (get(showGridBench) && loggedInBatch < LOGGED_PER_BATCH) {
		loggedInBatch++;
		const { z, x, y } = tile.tileIndex;
		console.log(
			`[render] ${tile.domain} ${z}/${x}/${y} ${tile.type} ${tile.interpolation} ${tile.tileSize}px: ${tile.renderMs.toFixed(1)} ms`
		);
	}
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
