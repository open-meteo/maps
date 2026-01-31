import { SvelteDate } from 'svelte/reactivity';

import { pad } from '$lib';

/**
 * Formats a date to display local time (HH:MM)
 * @param date - The date to format
 * @returns Formatted time string in local timezone (e.g., "14:30")
 */
export const formatLocalTime = (date: Date): string =>
	`${pad(date.getHours())}:${pad(date.getMinutes())}`;

/**
 * Formats a date to display local date (DD-MM)
 * @param date - The date to format
 * @returns Formatted date string in local timezone (e.g., "23-01")
 */
export const formatLocalDate = (date: Date): string =>
	`${pad(date.getDate())}-${pad(date.getMonth() + 1)}`;

/**
 * Formats a date to display local date and time (DD-MM HH:MM)
 * @param date - The date to format
 * @returns Formatted datetime string in local timezone (e.g., "23-01 14:30")
 */
export const formatLocalDateTime = (date: Date): string =>
	`${formatLocalDate(date)} ${formatLocalTime(date)}`;

/**
 * Formats a date to display UTC time (HH:MM)
 * @param date - The date to format
 * @returns Formatted time string in UTC timezone (e.g., "14:30")
 */
export const formatUTCTime = (date: Date): string =>
	`${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;

/**
 * Formats a date to display UTC date (DD-MM)
 * @param date - The date to format
 * @returns Formatted date string in UTC timezone (e.g., "23-01")
 */
export const formatUTCDate = (date: Date): string =>
	`${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}`;

/**
 * Formats a date to display UTC date and time (DD-MM HH:MM)
 * @param date - The date to format
 * @returns Formatted datetime string in UTC timezone (e.g., "23-01 14:30")
 */
export const formatUTCDateTime = (date: Date): string =>
	`${formatUTCDate(date)} ${formatUTCTime(date)}`;

/**
 * Creates a new date set to the start of the local day (00:00:00.000)
 * @param date - The date to use as reference
 * @returns A new SvelteDate at the start of the local day
 */
export const startOfLocalDay = (date: Date): SvelteDate => {
	const day = new SvelteDate(date);
	day.setHours(0, 0, 0, 0);
	return day;
};

/**
 * Creates a new date with specified local time
 * @param date - The base date to use
 * @param hour - The hour to set (0-23)
 * @param minute - The minute to set (0-59), defaults to 0
 * @returns A new SvelteDate with the specified local time
 */
export const withLocalTime = (date: Date, hour: number, minute = 0): SvelteDate => {
	const next = new SvelteDate(date);
	next.setHours(hour, minute, 0, 0);
	return next;
};

/**
 * Checks if a date matches any timestep in the provided array
 * @param date - The date to validate
 * @param timeSteps - Array of valid timesteps
 * @returns True if the date matches a timestep, false otherwise
 */
export const isValidTimeStep = (
	date: Date,
	timeSteps: Date[] | SvelteDate[] | undefined
): boolean => {
	if (!date || !timeSteps) return false;
	return timeSteps.some((validTime) => validTime.getTime() === date.getTime());
};

/**
 * Formats a date to ISO format without timezone (YYYY-MM-DDTHHMM)
 * @param date - The date to format
 * @returns ISO format string without colons or timezone indicator (e.g., "2026-01-23T1430")
 */
export const formatISOWithoutTimezone = (date: Date): string =>
	date.toISOString().replace(/[:Z]/g, '').slice(0, 15);

/**
 * Formats a date to ISO UTC format with 'Z' timezone (YYYY-MM-DDTHH:MMZ)
 * @param date - The date to format
 * @returns ISO UTC string with minutes and Z (e.g., "2026-02-03T06:00Z")
 */
export const formatISOUTCWithZ = (date: Date): string => {
	const year = date.getUTCFullYear();
	const month = pad(date.getUTCMonth() + 1);
	const day = pad(date.getUTCDate());
	const hour = pad(date.getUTCHours());
	const minute = pad(date.getUTCMinutes());
	return `${year}-${month}-${day}T${hour}:${minute}Z`;
};

/**
 * Parses an ISO format string without timezone to a Date object
 * @param isoString - ISO format string (YYYY-MM-DDTHHMM, e.g., "2026-01-23T1430")
 * @returns Date object in UTC timezone
 * @throws Error if the string format is invalid
 */
export const parseISOWithoutTimezone = (isoString: string): Date => {
	if (!isoString || isoString.length !== 15) {
		throw new Error('Invalid ISO string format. Expected format: YYYY-MM-DDTHHMM');
	}

	const year = parseInt(isoString.slice(0, 4), 10);
	const month = parseInt(isoString.slice(5, 7), 10);
	const day = parseInt(isoString.slice(8, 10), 10);
	const hour = parseInt(isoString.slice(11, 13), 10);
	const minute = parseInt(isoString.slice(13, 15), 10);

	if (
		isNaN(year) ||
		isNaN(month) ||
		isNaN(day) ||
		isNaN(hour) ||
		isNaN(minute) ||
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > 31 ||
		hour < 0 ||
		hour > 23 ||
		minute < 0 ||
		minute > 59
	) {
		throw new Error('Invalid date values in ISO string');
	}

	return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
};

/**
 * Formats the UTC offset for a given date
 * @param date - The date to format
 * @returns UTC offset string in ±HH:MM format (e.g., "+05:30", "-08:00")
 */
export const formatUTCOffset = (date: Date): string => {
	const offsetMinutes = -date.getTimezoneOffset();
	const sign = offsetMinutes >= 0 ? '+' : '-';
	const absOffsetMinutes = Math.abs(offsetMinutes);
	const hours = Math.floor(absOffsetMinutes / 60);
	const minutes = absOffsetMinutes % 60;
	return `${sign}${pad(hours)}:${pad(minutes)}`;
};
