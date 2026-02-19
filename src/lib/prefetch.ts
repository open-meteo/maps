import { get } from 'svelte/store';

import { currentBounds, getProtocolInstance, getRanges } from '@openmeteo/mapbox-layer';

import { omProtocolSettings } from '$lib/stores/om-protocol-settings';

import { fmtModelRun, fmtSelectedTime, getBaseUri } from '$lib';

import { MILLISECONDS_PER_DAY } from './constants';
import { selectedDomain } from './stores/variables';

import type { DomainMetaDataJson } from '@openmeteo/mapbox-layer';

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
 * Prefetch data for the specified time range
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

	try {
		const instance = getProtocolInstance(omProtocolSettings);
		const ranges = getRanges(get(selectedDomain).grid, currentBounds);
		const omFileReader = instance.omFileReader;

		// Build base URL
		const uri = getBaseUri(domain);

		let successCount = 0;
		const totalCount = timeSteps.length;

		// Helper to prefetch a single time step
		const prefetchSingle = async (timeStep: Date): Promise<boolean> => {
			if (signal?.aborted) return false;

			const url = `${uri}/data_spatial/${domain}/${fmtModelRun(modelRun)}/${fmtSelectedTime(
				timeStep
			)}.om`;

			try {
				await omFileReader.setToOmFile(url);
				await omFileReader.prefetchVariable(variable, ranges, signal);
				return true;
			} catch {
				// Silently continue on errors
				return false;
			}
		};

		// Prefetch multiple time steps in parallel with a simple concurrency limit
		const concurrency = 8;
		let index = 0;

		const worker = async () => {
			let localSuccess = 0;
			while (true) {
				if (signal?.aborted) break;

				const i = index++;
				if (i >= timeSteps.length) break;

				const succeeded = await prefetchSingle(timeSteps[i]);
				if (succeeded) {
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
		successCount = results.reduce((sum, v) => sum + v, 0);

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
