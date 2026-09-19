import { get } from 'svelte/store';

import {
	GridFactory,
	currentBounds,
	domainOptions,
	getProtocolInstance,
	getRanges,
	isSeamlessDomain,
	resolveConcreteDomain
} from '@openmeteo/weather-map-layer';

import { omProtocolSettings } from '$lib/stores/om-protocol-settings';

import { MILLISECONDS_PER_DAY } from './constants';
import { BASE_URI, fmtModelRun, fmtSelectedTime } from './helpers';

import type { AnyDomain, DomainMetaDataJson } from '@openmeteo/weather-map-layer';

export type PrefetchMode = 'today' | 'next24h' | 'prev24h' | 'completeModelRun';

export interface PrefetchOptions {
	startDate: Date;
	endDate: Date;
	metaJson: DomainMetaDataJson;
	modelRun: Date;
	domain: string;
	variable: string;
	signal?: AbortSignal;
}

export interface PrefetchResult {
	success: boolean;
	successCount: number;
	totalCount: number;
	error?: string;
	aborted?: boolean;
}

export interface PrefetchProgress {
	current: number;
	total: number;
}

type DimensionRanges = ReturnType<typeof getRanges>;
type Bounds = [number, number, number, number];

/**
 * Calculate the start and end dates for a given prefetch mode
 *
 * @param mode - The prefetch mode
 * @param currentTime - The current selected time
 * @param metaJson - The metadata JSON containing valid times
 * @returns An object with startDate and endDate
 */
export const getDateRangeForMode = (
	mode: PrefetchMode,
	currentTime: Date,
	metaJson: DomainMetaDataJson
): { startDate: Date; endDate: Date } => {
	switch (mode) {
		case 'today': {
			const startDate = new Date();
			startDate.setHours(0, 0, 0, 0);
			const endDate = new Date(startDate.getTime() + MILLISECONDS_PER_DAY);
			return { startDate, endDate };
		}
		case 'next24h': {
			const startDate = new Date(currentTime.getTime());
			const endDate = new Date(currentTime.getTime() + MILLISECONDS_PER_DAY);
			return { startDate, endDate };
		}
		case 'prev24h': {
			const startDate = new Date(currentTime.getTime() - MILLISECONDS_PER_DAY);
			const endDate = new Date(currentTime.getTime());
			return { startDate, endDate };
		}
		case 'completeModelRun': {
			const allTimeSteps = metaJson.valid_times.map((vt: string) => new Date(vt));
			const startDate = allTimeSteps[0];
			const endDate = allTimeSteps[allTimeSteps.length - 1];
			return { startDate, endDate };
		}
		default:
			return { startDate: currentTime, endDate: currentTime };
	}
};

/**
 * Get the time steps to prefetch based on start and end dates
 */
const getTimeStepsInRange = (
	metaJson: DomainMetaDataJson,
	startDate: Date,
	endDate: Date
): Date[] => {
	const allTimeSteps = metaJson.valid_times.map((vt: string) => new Date(vt));
	const startTime = startDate.getTime();
	const endTime = endDate.getTime();

	return allTimeSteps.filter((date: Date) => {
		const time = date.getTime();
		return time >= startTime && time <= endTime;
	});
};

/** True when two longitude spans overlap, treating a span with min > max as
 *  dateline-crossing ([min..180] ∪ [-180..max]). Mirrors the gate the seamless
 *  protocol applies when deciding which sub-layers to load. */
const lonRangesOverlap = (aMin: number, aMax: number, bMin: number, bMax: number): boolean => {
	const aWraps = aMin > aMax;
	const bWraps = bMin > bMax;
	if (!aWraps && !bWraps) return aMin <= bMax && bMin <= aMax;
	if (aWraps && bWraps) return true;
	if (aWraps) return bMax >= aMin || bMin <= aMax;
	return aMax >= bMin || aMin <= bMax;
};

/** True when two lon/lat bounding boxes share any area (dateline-aware). */
const boundsIntersect = (a: Bounds, b: Bounds): boolean => {
	if (a[1] > b[3] || b[1] > a[3]) return false;
	return lonRangesOverlap(a[0], a[2], b[0], b[2]);
};

/**
 * A single concrete file to handle for a timestep: the data-spatial domain to
 * request, how to handle it, and an optional forecast horizon.
 */
interface PrefetchTarget {
	/** The `data_spatial/<value>` domain segment to fetch. */
	domainValue: string;
	/**
	 * When true, only warm the file header/tail (the layer is off-screen) instead
	 * of prefetching its viewport data. `ranges` is unset for warm-only targets.
	 */
	warmOnly: boolean;
	/** Grid ranges covering the viewport — only set for full (in-view) prefetches. */
	ranges?: DimensionRanges;
	/**
	 * Maximum lead time (hours) this layer produces data for; timesteps beyond it
	 * are skipped to avoid 404s, matching the seamless protocol's lead-time gate.
	 */
	maxForecastHours?: number;
}

/**
 * Resolve the concrete files to handle for a domain.
 *
 * For a regular grid domain this is just the domain itself. For a seamless
 * composite it expands to every concrete sub-layer — exactly the files the
 * seamless protocol loads. Sub-layers that overlap the viewport (and the global
 * fallback, which always covers the view) are prefetched in full; non-global
 * sub-layers that are off-screen are only warmed (file header/tail), so panning
 * to them later is fast without paying to fetch their data up front.
 *
 * @param domainValue - The selected (possibly seamless) domain value
 * @param bounds - The current viewport bounds, or undefined for the full grid
 */
const getPrefetchTargets = (domainValue: string, bounds: Bounds | undefined): PrefetchTarget[] => {
	const anyDomain = domainOptions.find((d) => d.value === domainValue) as AnyDomain | undefined;
	if (!anyDomain) return [];

	if (!isSeamlessDomain(anyDomain)) {
		return [
			{ domainValue: anyDomain.value, warmOnly: false, ranges: getRanges(anyDomain.grid, bounds) }
		];
	}

	const targets: PrefetchTarget[] = [];
	const globalLayer = anyDomain.layers[anyDomain.layers.length - 1];
	for (const layer of anyDomain.layers) {
		const concrete = resolveConcreteDomain(layer.domainValue, domainOptions);
		if (!concrete) continue;

		// Viewport gate: a regional layer entirely off-screen contributes nothing to
		// the current view, so warm its header only instead of prefetching its data.
		let warmOnly = false;
		if (layer !== globalLayer && bounds) {
			const domainBounds = GridFactory.create(concrete.grid, null).getBounds() as Bounds;
			warmOnly = !boundsIntersect(domainBounds, bounds);
		}

		targets.push({
			domainValue: concrete.value,
			warmOnly,
			ranges: warmOnly ? undefined : getRanges(concrete.grid, bounds),
			maxForecastHours: layer.maxForecastHours
		});
	}
	return targets;
};

/**
 * Prefetch data for the specified time range.
 *
 * Warms the protocol's block cache for the current viewport across the given
 * timesteps. For seamless composite domains every concrete sub-layer in view is
 * prefetched, mirroring what the seamless protocol loads when rendering.
 *
 * @param options - The prefetch options with start and end dates
 * @param onProgress - Optional callback for progress updates
 * @returns A promise that resolves to the prefetch result
 */
export const prefetchData = async (
	options: PrefetchOptions,
	onProgress?: (progress: PrefetchProgress) => void
): Promise<PrefetchResult> => {
	const { startDate, endDate, metaJson, modelRun, domain, variable, signal } = options;

	// Get the time steps to prefetch
	const timeSteps = getTimeStepsInRange(metaJson, startDate, endDate);

	if (timeSteps.length === 0) {
		return {
			success: false,
			successCount: 0,
			totalCount: 0,
			error: 'No time steps available for prefetching'
		};
	}

	// Resolve the concrete files to warm (one per in-view sub-layer for seamless).
	const targets = getPrefetchTargets(domain, currentBounds);

	if (targets.length === 0) {
		return {
			success: false,
			successCount: 0,
			totalCount: 0,
			error: 'No layers available for prefetching'
		};
	}

	try {
		const instance = getProtocolInstance(get(omProtocolSettings));
		const omFileReader = instance.omFileReader;

		// All sub-layers of a seamless composite share the same run path.
		const runPath = fmtModelRun(modelRun);
		const runTime = modelRun.getTime();

		const totalCount = timeSteps.length;

		// Prefetch every applicable target file for a single timestep. Reads are
		// atomic per call, so all targets can safely share the protocol's reader.
		const prefetchSingle = async (timeStep: Date): Promise<boolean> => {
			if (signal?.aborted) return false;

			const leadHours = (timeStep.getTime() - runTime) / 3_600_000;
			const validPath = fmtSelectedTime(timeStep);

			// Success is measured over in-view (full) prefetches only; warming
			// off-screen layers is best-effort and never fails a timestep.
			let attempted = 0;
			let succeeded = 0;
			for (const target of targets) {
				if (signal?.aborted) break;

				// Skip layers whose forecast horizon this timestep exceeds (avoids 404s).
				if (target.maxForecastHours !== undefined && leadHours > target.maxForecastHours) {
					continue;
				}

				const url = `${BASE_URI}/${target.domainValue}/${runPath}/${validPath}.om`;

				if (target.warmOnly) {
					// Touches the file header/tail only; no variable data is requested.
					// Best-effort warm: a sub-layer may have no file for this timestep.
					await omFileReader.warmFile(url).catch(() => {});
					continue;
				}

				attempted++;
				try {
					await omFileReader.prefetchVariable(url, variable, target.ranges ?? null, signal);
					succeeded++;
				} catch {
					// Silently continue on errors (best-effort cache warming)
				}
			}

			return attempted > 0 && succeeded === attempted;
		};

		// Prefetch multiple time steps in parallel with a simple concurrency limit.
		const concurrency = 8;
		let index = 0;

		const worker = async () => {
			let localSuccess = 0;
			while (true) {
				if (signal?.aborted) break;

				const i = index++;
				if (i >= timeSteps.length) break;

				if (await prefetchSingle(timeSteps[i])) {
					localSuccess++;
				}

				if (onProgress) {
					onProgress({ current: i + 1, total: totalCount });
				}
			}
			return localSuccess;
		};

		const workersCount = Math.min(concurrency, timeSteps.length);
		const workerPromises: Promise<number>[] = [];
		for (let w = 0; w < workersCount; w++) {
			workerPromises.push(worker());
		}

		const results = await Promise.all(workerPromises);
		const successCount = results.reduce((sum, v) => sum + v, 0);

		if (signal?.aborted) {
			return {
				success: false,
				successCount,
				totalCount,
				aborted: true,
				error: 'Prefetch aborted'
			};
		}

		return {
			success: true,
			successCount,
			totalCount
		};
	} catch (error) {
		return {
			success: false,
			successCount: 0,
			totalCount: timeSteps.length,
			error: error instanceof Error ? error.message : 'Prefetch failed'
		};
	}
};
