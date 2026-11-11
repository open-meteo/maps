/**
 * NOAA's GFS archive on AWS Open Data: every run since 2021 as GRIB2 files
 * with `.idx` inventories, which the layer reads through the om protocol.
 * The archive has no run metadata of its own, so runs and their forecast
 * hours are discovered by listing the bucket, and the variable list comes
 * from a time step's inventory.
 */
import {
	type Domain,
	type DomainMetaDataJson,
	domainOptions,
	gfsStoredVariables,
	parseGribIndex
} from '@openmeteo/weather-map-layer';

import { MILLISECONDS_PER_HOUR } from './constants';
import { pad } from './helpers';

export interface ArchiveDomain extends Domain {
	archive: {
		/** File family within a cycle: the 0.25° pressure product or the native-grid surface fluxes. */
		product: 'pgrb2.0p25' | 'sfluxgrbf';
	};
}

const BUCKET = 'https://noaa-gfs-bdp-pds.s3.amazonaws.com';

/** The first run the bucket holds. */
export const ARCHIVE_START = new Date(Date.UTC(2021, 0, 1));
/** From this cycle on (GFS v16) the files sit in an `atmos/` directory. */
const ATMOS_LAYOUT_SINCE = Date.UTC(2021, 2, 22, 12);

const gridOf = (value: string) => {
	const domain = domainOptions.find((option) => option.value === value);
	if (!domain) throw new Error(`Unknown base domain ${value}`);
	return domain.grid;
};

/** Archive entries, on the grids of the domains the data server serves for the same products. */
export const ARCHIVE_DOMAINS: ArchiveDomain[] = [
	{
		value: 'ncep_gfs025_archive',
		label: 'GFS Global 0.25° Archive (since 2021)',
		grid: gridOf('ncep_gfs025'),
		time_interval: 'hourly',
		model_interval: '6_hourly',
		archive: { product: 'pgrb2.0p25' }
	},
	{
		value: 'ncep_gfs013_archive',
		label: 'GFS Global 0.13° Archive (since 2021)',
		grid: gridOf('ncep_gfs013'),
		time_interval: 'hourly',
		model_interval: '6_hourly',
		archive: { product: 'sfluxgrbf' }
	}
];

export const archiveDomain = (value: string): ArchiveDomain | undefined =>
	ARCHIVE_DOMAINS.find((domain) => domain.value === value);

const yyyymmdd = (run: Date) =>
	`${run.getUTCFullYear()}${pad(run.getUTCMonth() + 1)}${pad(run.getUTCDate())}`;

/** The key prefix of a cycle's files. */
const cyclePrefix = (run: Date) =>
	`gfs.${yyyymmdd(run)}/${pad(run.getUTCHours())}/${run.getTime() >= ATMOS_LAYOUT_SINCE ? 'atmos/' : ''}`;

/** A time step's file name, without the forecast hour when `hour` is undefined (a listing prefix). */
const fileName = (archive: ArchiveDomain, run: Date, hour?: number) => {
	const hh = pad(run.getUTCHours());
	const fff = hour === undefined ? '' : String(hour).padStart(3, '0');
	return archive.archive.product === 'sfluxgrbf'
		? `gfs.t${hh}z.sfluxgrbf${fff}${hour === undefined ? '' : '.grib2'}`
		: `gfs.t${hh}z.pgrb2.0p25.f${fff}`;
};

/** The `.idx` URL of one time step; the om protocol reads the GRIB file next to it. */
export const archiveIndexUrl = (archive: ArchiveDomain, run: Date, forecastHour: number): string =>
	`${BUCKET}/${cyclePrefix(run)}${fileName(archive, run, forecastHour)}.idx`;

/** Lead time of `time` in the run, the forecast hour the file is named by. */
export const forecastHour = (run: Date, time: Date): number =>
	Math.round((time.getTime() - run.getTime()) / MILLISECONDS_PER_HOUR);

interface Listing {
	keys: string[];
	prefixes: string[];
}

/** One page of the bucket listing (ListObjectsV2); a cycle's files fit in it. */
const list = async (prefix: string, delimiter?: string): Promise<Listing> => {
	const url = new URL(BUCKET);
	url.searchParams.set('list-type', '2');
	url.searchParams.set('prefix', prefix);
	if (delimiter) url.searchParams.set('delimiter', delimiter);
	const response = await fetch(url);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
	const texts = (selector: string) =>
		Array.from(xml.querySelectorAll(selector), (node) => node.textContent ?? '');
	return { keys: texts('Contents > Key'), prefixes: texts('CommonPrefixes > Prefix') };
};

/** The cycles of one UTC day, oldest first. */
export const archiveCycles = async (day: Date): Promise<Date[]> => {
	const { prefixes } = await list(`gfs.${yyyymmdd(day)}/`, '/');
	return prefixes
		.map((prefix) => prefix.match(/\/(\d\d)\/$/)?.[1])
		.filter((hour): hour is string => hour !== undefined)
		.map(
			(hour) =>
				new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), Number(hour)))
		);
};

/** The newest cycle with files: today's last, else yesterday's. */
export const newestArchiveRun = async (): Promise<Date | undefined> => {
	const today = new Date();
	for (const daysBack of [0, 1]) {
		const day = new Date(today);
		day.setUTCDate(day.getUTCDate() - daysBack);
		const cycles = await archiveCycles(day);
		if (cycles.length > 0) return cycles[cycles.length - 1];
	}
	return undefined;
};

/** The forecast hours a run has inventories for, ascending. */
export const archiveForecastHours = async (
	archive: ArchiveDomain,
	run: Date
): Promise<number[]> => {
	const { keys } = await list(`${cyclePrefix(run)}${fileName(archive, run)}`);
	const pattern =
		archive.archive.product === 'sfluxgrbf' ? /sfluxgrbf(\d{3})\.grib2\.idx$/ : /\.f(\d{3})\.idx$/;
	return keys
		.map((key) => key.match(pattern)?.[1])
		.filter((hour): hour is string => hour !== undefined)
		.map(Number)
		.sort((a, b) => a - b);
};

/** The highest forecast hour of a finished run. */
const FINAL_FORECAST_HOUR = 384;

/**
 * Run metadata in the data server's shape, so the rest of the app needs no
 * special case: valid times from the inventories present, variables from
 * the inventory of the first step past the analysis (which lacks the period
 * statistics), completed once the last forecast hour has arrived.
 */
export const archiveMetaData = async (
	archive: ArchiveDomain,
	run: Date
): Promise<DomainMetaDataJson> => {
	const hours = await archiveForecastHours(archive, run);
	if (hours.length === 0) throw new Error('no files for this run');
	const sample = hours.find((hour) => hour >= 3) ?? hours[hours.length - 1];
	const response = await fetch(archiveIndexUrl(archive, run, sample));
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const variables = Array.from(gfsStoredVariables(parseGribIndex(await response.text()))).sort();
	return {
		reference_time: run.toISOString(),
		valid_times: hours.map((hour) =>
			new Date(run.getTime() + hour * MILLISECONDS_PER_HOUR).toISOString()
		),
		variables,
		completed: hours.includes(FINAL_FORECAST_HOUR),
		last_modified_time: new Date().toISOString()
	};
};
