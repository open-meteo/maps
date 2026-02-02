import { getProtocolInstance } from '@openmeteo/mapbox-layer';

import { omProtocolSettings } from '$lib/stores/om-protocol-settings';

import { fmtModelRun, fmtSelectedTime } from '$lib';

import { MILLISECONDS_PER_DAY } from './constants';

import type { DomainMetaDataJson } from '@openmeteo/mapbox-layer';

export type PrefetchMode = 'next24h' | 'prev24h' | 'completeModelRun';

export interface PrefetchOptions {
	startDate: Date;
	endDate: Date;
	metaJson: DomainMetaDataJson;
	modelRun: Date;
	domain: string;
	variable: string;
}

export interface PrefetchResult {
	success: boolean;
	successCount: number;
	totalCount: number;
	error?: string;
}

export interface PrefetchProgress {
	current: number;
	total: number;
}

/**
 * Get a human-readable label for the prefetch mode
 */
export const getPrefetchModeLabel = (mode: PrefetchMode): string => {
	switch (mode) {
		case 'next24h':
			return 'Next 24 hours';
		case 'prev24h':
			return 'Previous 24 hours';
		case 'completeModelRun':
			return 'Complete model run';
		default:
			return 'Unknown';
	}
};

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
	const { startDate, endDate, metaJson, modelRun, domain, variable } = options;

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
		const omFileReader = instance.omFileReader;

		// Build base URL
		const uri =
			domain && domain.startsWith('dwd_icon')
				? `https://s3.servert.ch`
				: `https://map-tiles.open-meteo.com`;

		let successCount = 0;
		const totalCount = timeSteps.length;

		for (let i = 0; i < timeSteps.length; i++) {
			const timeStep = timeSteps[i];
			const url = `${uri}/data_spatial/${domain}/${fmtModelRun(modelRun)}/${fmtSelectedTime(timeStep)}.om`;

			try {
				await omFileReader.setToOmFile(url);
				await omFileReader.prefetchVariable(variable);
				successCount++;
			} catch {
				// Silently continue on errors
			}

			// Report progress
			if (onProgress) {
				onProgress({ current: i + 1, total: totalCount });
			}
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
