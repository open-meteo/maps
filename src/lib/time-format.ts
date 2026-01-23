import { SvelteDate } from 'svelte/reactivity';

/**
 * Pads a number with leading zeros to ensure 2 digits
 */
export const pad = (num: number): string => String(num).padStart(2, '0');

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
