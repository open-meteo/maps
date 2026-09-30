import { get } from 'svelte/store';

import {
	currentBounds,
	getProtocolInstance,
	getRanges,
	isSeamlessDomain,
	selectSeamlessLayers
} from '@openmeteo/weather-map-layer';

import { omProtocolSettings } from '$lib/stores/om-protocol-settings';

import { MILLISECONDS_PER_DAY } from './constants';
import { BASE_URI, fmtModelRun, fmtSelectedTime } from './helpers';

import type { Domain, DomainMetaDataJson } from '@openmeteo/weather-map-layer';

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

/**
 * Prefetch data for the specified time range.
 *
 * Warms the protocol's block cache for the current viewport across the given
 * timesteps. For a seamless composite the sub-domains the protocol would load
 * are prefetched, so a timestep switch is never a cold start.
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

	const settings = get(omProtocolSettings);
	const selected = settings.domainOptions.find((d) => d.value === domain);
	if (!selected) {
		return { success: false, successCount: 0, totalCount: 0, error: `Unknown domain ${domain}` };
	}

	try {
		const omFileReader = getProtocolInstance(settings).omFileReader;

		// All sub-domains of a seamless composite share the same run path.
		const runPath = fmtModelRun(modelRun);
		const totalCount = timeSteps.length;

		// The files a timestep needs: the domain's own, or for a seamless
		// composite those of the sub-domains the protocol would load for the
		// current viewport and lead time, so the cache holds what rendering reads.
		const domainsFor = (timeStep: Date): Domain[] =>
			isSeamlessDomain(selected)
				? selectSeamlessLayers(selected, settings.domainOptions, {
						viewportBounds: currentBounds,
						leadTimeHours: (timeStep.getTime() - modelRun.getTime()) / 3_600_000
					}).map(({ domain }) => domain)
				: [selected];

		// Prefetch every file of a single timestep. Reads are atomic per call, so
		// all of them can safely share the protocol's reader.
		const prefetchSingle = async (timeStep: Date): Promise<boolean> => {
			const validPath = fmtSelectedTime(timeStep);
			let succeeded = true;
			for (const concrete of domainsFor(timeStep)) {
				if (signal?.aborted) return false;
				const url = `${BASE_URI}/${concrete.value}/${runPath}/${validPath}.om`;
				try {
					await omFileReader.prefetchVariable(
						url,
						variable,
						getRanges(concrete.grid, currentBounds),
						signal
					);
				} catch {
					// Best-effort cache warming: keep going with the other files
					succeeded = false;
				}
			}
			return succeeded;
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
