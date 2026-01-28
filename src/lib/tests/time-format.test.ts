import { SvelteDate } from 'svelte/reactivity';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	formatISOWithoutTimezone,
	formatLocalDate,
	formatLocalDateTime,
	formatLocalTime,
	formatUTCDate,
	formatUTCDateTime,
	formatUTCOffset,
	formatUTCTime,
	isValidTimeStep,
	parseISOWithoutTimezone,
	startOfLocalDay,
	withLocalTime
} from '$lib/time-format';

describe('formatLocalTime', () => {
	beforeEach(() => {
		// Mock timezone to UTC+1 (CET) by setting TZ environment variable
		vi.stubEnv('TZ', 'Europe/Berlin');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('should format time in UTC+1 timezone', () => {
		const date = new Date('2026-01-23T14:30:00Z'); // 14:30 UTC = 15:30 CET
		const result = formatLocalTime(date);
		expect(result).toBe('15:30');
	});

	it('should pad single digits', () => {
		const date = new Date(2026, 0, 23, 9, 5); // Local: 09:05
		const result = formatLocalTime(date);
		expect(result).toBe('09:05');
	});

	it('should handle midnight', () => {
		const date = new Date(2026, 0, 23, 0, 0); // Local: 00:00
		const result = formatLocalTime(date);
		expect(result).toBe('00:00');
	});
});

describe('formatLocalDate', () => {
	it('should format date in DD-MM format', () => {
		const date = new Date(2026, 0, 23); // January 23, 2026
		const result = formatLocalDate(date);
		expect(result).toBe('23-01');
	});

	it('should pad single digits for day and month', () => {
		const date = new Date(2026, 0, 5); // January 5, 2026
		const result = formatLocalDate(date);
		expect(result).toBe('05-01');
	});

	it('should handle December correctly', () => {
		const date = new Date(2026, 11, 31); // December 31, 2026
		const result = formatLocalDate(date);
		expect(result).toBe('31-12');
	});
});

describe('formatLocalDateTime', () => {
	it('should format date and time together', () => {
		const date = new Date(2026, 0, 23, 14, 30); // January 23, 2026 14:30
		const result = formatLocalDateTime(date);
		expect(result).toBe('23-01 14:30');
	});
});

describe('formatUTCTime', () => {
	it('should format time in UTC timezone', () => {
		const date = new Date('2026-01-23T14:30:00Z');
		const result = formatUTCTime(date);
		expect(result).toBe('14:30');
	});

	it('should pad single digits', () => {
		const date = new Date('2026-01-23T09:05:00Z');
		const result = formatUTCTime(date);
		expect(result).toBe('09:05');
	});

	it('should handle midnight UTC', () => {
		const date = new Date('2026-01-23T00:00:00Z');
		const result = formatUTCTime(date);
		expect(result).toBe('00:00');
	});
});

describe('formatUTCDate', () => {
	it('should format date in DD-MM format using UTC', () => {
		const date = new Date('2026-01-23T14:30:00Z');
		const result = formatUTCDate(date);
		expect(result).toBe('23-01');
	});

	it('should pad single digits for day and month', () => {
		const date = new Date('2026-01-05T14:30:00Z');
		const result = formatUTCDate(date);
		expect(result).toBe('05-01');
	});

	it('should handle December correctly', () => {
		const date = new Date('2026-12-31T23:59:59Z');
		const result = formatUTCDate(date);
		expect(result).toBe('31-12');
	});
});

describe('formatUTCDateTime', () => {
	it('should format date and time together in UTC', () => {
		const date = new Date('2026-01-23T14:30:00Z');
		const result = formatUTCDateTime(date);
		expect(result).toBe('23-01 14:30');
	});

	it('should handle timezone edge cases', () => {
		// Last minute of the day in UTC
		const date = new Date('2026-01-23T23:59:00Z');
		const result = formatUTCDateTime(date);
		expect(result).toBe('23-01 23:59');
	});
});

describe('startOfLocalDay', () => {
	it('should return start of day in local timezone', () => {
		const date = new Date(2026, 0, 23, 14, 30, 45, 123);
		const result = startOfLocalDay(date);

		expect(result.getFullYear()).toBe(2026);
		expect(result.getMonth()).toBe(0);
		expect(result.getDate()).toBe(23);
		expect(result.getHours()).toBe(0);
		expect(result.getMinutes()).toBe(0);
		expect(result.getSeconds()).toBe(0);
		expect(result.getMilliseconds()).toBe(0);
	});

	it('should return a SvelteDate instance', () => {
		const date = new Date(2026, 0, 23, 14, 30);
		const result = startOfLocalDay(date);

		expect(result).toBeInstanceOf(SvelteDate);
	});

	it('should not modify the original date', () => {
		const original = new Date(2026, 0, 23, 14, 30);
		const originalTime = original.getTime();

		startOfLocalDay(original);

		expect(original.getTime()).toBe(originalTime);
	});
});

describe('withLocalTime', () => {
	it('should set time to specified hour and minute', () => {
		const date = new Date(2026, 0, 23);
		const result = withLocalTime(date, 14, 30);

		expect(result.getHours()).toBe(14);
		expect(result.getMinutes()).toBe(30);
		expect(result.getSeconds()).toBe(0);
		expect(result.getMilliseconds()).toBe(0);
	});

	it('should default minute to 0 when not provided', () => {
		const date = new Date(2026, 0, 23);
		const result = withLocalTime(date, 15);

		expect(result.getHours()).toBe(15);
		expect(result.getMinutes()).toBe(0);
	});

	it('should preserve the date', () => {
		const date = new Date(2026, 0, 23);
		const result = withLocalTime(date, 10, 30);

		expect(result.getFullYear()).toBe(2026);
		expect(result.getMonth()).toBe(0);
		expect(result.getDate()).toBe(23);
	});

	it('should return a SvelteDate instance', () => {
		const date = new Date(2026, 0, 23);
		const result = withLocalTime(date, 10, 30);

		expect(result).toBeInstanceOf(SvelteDate);
	});

	it('should not modify the original date', () => {
		const original = new Date(2026, 0, 23, 8, 0);
		const originalTime = original.getTime();

		withLocalTime(original, 14, 30);

		expect(original.getTime()).toBe(originalTime);
	});

	it('should handle edge cases like hour 0 and 23', () => {
		const date = new Date(2026, 0, 23);

		const midnight = withLocalTime(date, 0, 0);
		expect(midnight.getHours()).toBe(0);
		expect(midnight.getMinutes()).toBe(0);

		const endOfDay = withLocalTime(date, 23, 59);
		expect(endOfDay.getHours()).toBe(23);
		expect(endOfDay.getMinutes()).toBe(59);
	});
});

describe('isValidTimeStep', () => {
	it('should return true for exact match', () => {
		const timeSteps = [
			new Date('2026-01-23T10:00:00Z'),
			new Date('2026-01-23T11:00:00Z'),
			new Date('2026-01-23T12:00:00Z')
		];
		const date = new Date('2026-01-23T11:00:00Z');

		expect(isValidTimeStep(date, timeSteps)).toBe(true);
	});

	it('should return false when date is not in timesteps', () => {
		const timeSteps = [
			new Date('2026-01-23T10:00:00Z'),
			new Date('2026-01-23T11:00:00Z'),
			new Date('2026-01-23T12:00:00Z')
		];
		const date = new Date('2026-01-23T11:30:00Z');

		expect(isValidTimeStep(date, timeSteps)).toBe(false);
	});

	it('should return false when timesteps is undefined', () => {
		const date = new Date('2026-01-23T11:00:00Z');

		expect(isValidTimeStep(date, undefined)).toBe(false);
	});

	it('should return false when timesteps is empty', () => {
		const date = new Date('2026-01-23T11:00:00Z');

		expect(isValidTimeStep(date, [])).toBe(false);
	});

	it('should return false when date is undefined', () => {
		const timeSteps = [new Date('2026-01-23T10:00:00Z')];

		expect(isValidTimeStep(undefined as any, timeSteps)).toBe(false);
	});

	it('should work with SvelteDate instances', () => {
		const timeSteps = [
			new SvelteDate('2026-01-23T10:00:00Z'),
			new SvelteDate('2026-01-23T11:00:00Z')
		];
		const date = new SvelteDate('2026-01-23T11:00:00Z');

		expect(isValidTimeStep(date, timeSteps)).toBe(true);
	});

	it('should work with mixed Date and SvelteDate', () => {
		const timeSteps = [new Date('2026-01-23T10:00:00Z'), new Date('2026-01-23T11:00:00Z')];
		const date = new SvelteDate('2026-01-23T11:00:00Z');

		expect(isValidTimeStep(date, timeSteps)).toBe(true);
	});
});

describe('formatISOWithoutTimezone', () => {
	it('should format date to ISO format without timezone', () => {
		const date = new Date('2026-01-23T14:30:00Z');
		const result = formatISOWithoutTimezone(date);
		expect(result).toBe('2026-01-23T1430');
	});

	it('should remove colons and timezone indicator', () => {
		const date = new Date('2026-01-23T09:05:15Z');
		const result = formatISOWithoutTimezone(date);
		expect(result).toBe('2026-01-23T0905');
	});

	it('should handle midnight UTC', () => {
		const date = new Date('2026-01-23T00:00:00Z');
		const result = formatISOWithoutTimezone(date);
		expect(result).toBe('2026-01-23T0000');
	});

	it('should handle end of day', () => {
		const date = new Date('2026-01-23T23:59:59Z');
		const result = formatISOWithoutTimezone(date);
		expect(result).toBe('2026-01-23T2359');
	});

	it('should pad single digit hours and minutes', () => {
		const date = new Date('2026-12-31T01:05:30Z');
		const result = formatISOWithoutTimezone(date);
		expect(result).toBe('2026-12-31T0105');
	});

	it('should return a string', () => {
		const date = new Date('2026-01-23T14:30:00Z');
		const result = formatISOWithoutTimezone(date);
		expect(typeof result).toBe('string');
	});
});

describe('parseISOWithoutTimezone', () => {
	it('should parse ISO string to Date object', () => {
		const isoString = '2026-01-23T1430';
		const result = parseISOWithoutTimezone(isoString);
		expect(result).toBeInstanceOf(Date);
		expect(result.getUTCFullYear()).toBe(2026);
		expect(result.getUTCMonth()).toBe(0); // January is 0
		expect(result.getUTCDate()).toBe(23);
		expect(result.getUTCHours()).toBe(14);
		expect(result.getUTCMinutes()).toBe(30);
	});

	it('should parse midnight correctly', () => {
		const isoString = '2026-01-23T0000';
		const result = parseISOWithoutTimezone(isoString);
		expect(result.getUTCHours()).toBe(0);
		expect(result.getUTCMinutes()).toBe(0);
	});

	it('should parse end of day correctly', () => {
		const isoString = '2026-01-23T2359';
		const result = parseISOWithoutTimezone(isoString);
		expect(result.getUTCHours()).toBe(23);
		expect(result.getUTCMinutes()).toBe(59);
	});

	it('should parse single digit hours and minutes with padding', () => {
		const isoString = '2026-12-31T0105';
		const result = parseISOWithoutTimezone(isoString);
		expect(result.getUTCFullYear()).toBe(2026);
		expect(result.getUTCMonth()).toBe(11); // December is 11
		expect(result.getUTCDate()).toBe(31);
		expect(result.getUTCHours()).toBe(1);
		expect(result.getUTCMinutes()).toBe(5);
	});

	it('should be inverse of formatISOWithoutTimezone', () => {
		const originalDate = new Date('2026-01-23T14:30:00Z');
		const isoString = formatISOWithoutTimezone(originalDate);
		const parsedDate = parseISOWithoutTimezone(isoString);
		expect(parsedDate.getTime()).toBe(
			Date.UTC(
				originalDate.getUTCFullYear(),
				originalDate.getUTCMonth(),
				originalDate.getUTCDate(),
				originalDate.getUTCHours(),
				originalDate.getUTCMinutes(),
				0,
				0
			)
		);
	});

	it('should throw error for invalid string length', () => {
		expect(() => parseISOWithoutTimezone('2026-01-23')).toThrow(
			'Invalid ISO string format. Expected format: YYYY-MM-DDTHHMM'
		);
		expect(() => parseISOWithoutTimezone('2026-01-23T14:30:00')).toThrow(
			'Invalid ISO string format. Expected format: YYYY-MM-DDTHHMM'
		);
	});

	it('should throw error for empty string', () => {
		expect(() => parseISOWithoutTimezone('')).toThrow(
			'Invalid ISO string format. Expected format: YYYY-MM-DDTHHMM'
		);
	});

	it('should throw error for invalid month', () => {
		expect(() => parseISOWithoutTimezone('2026-13-23T1430')).toThrow(
			'Invalid date values in ISO string'
		);
		expect(() => parseISOWithoutTimezone('2026-00-23T1430')).toThrow(
			'Invalid date values in ISO string'
		);
	});

	it('should throw error for invalid day', () => {
		expect(() => parseISOWithoutTimezone('2026-01-32T1430')).toThrow(
			'Invalid date values in ISO string'
		);
		expect(() => parseISOWithoutTimezone('2026-01-00T1430')).toThrow(
			'Invalid date values in ISO string'
		);
	});

	it('should throw error for invalid hour', () => {
		expect(() => parseISOWithoutTimezone('2026-01-23T2430')).toThrow(
			'Invalid date values in ISO string'
		);
	});

	it('should throw error for invalid minute', () => {
		expect(() => parseISOWithoutTimezone('2026-01-23T1460')).toThrow(
			'Invalid date values in ISO string'
		);
	});

	it('should throw error for non-numeric values', () => {
		expect(() => parseISOWithoutTimezone('XXXX-XX-XXTXXXX')).toThrow(
			'Invalid date values in ISO string'
		);
	});
});

describe('formatUTCOffset', () => {
	it('should format UTC+0 offset', () => {
		vi.stubEnv('TZ', 'UTC');
		const date = new Date('2026-01-23T14:30:00Z');
		const result = formatUTCOffset(date);
		expect(result).toBe('+00:00');
		vi.unstubAllEnvs();
	});

	it('should format positive UTC offset (UTC+1)', () => {
		vi.stubEnv('TZ', 'Europe/Berlin');
		const date = new Date('2026-01-23T14:30:00Z');
		const result = formatUTCOffset(date);
		expect(result).toBe('+01:00');
		vi.unstubAllEnvs();
	});

	it('should format positive UTC offset with minutes (UTC+5:30)', () => {
		vi.stubEnv('TZ', 'Asia/Kolkata');
		const date = new Date('2026-01-23T14:30:00Z');
		const result = formatUTCOffset(date);
		expect(result).toBe('+05:30');
		vi.unstubAllEnvs();
	});

	it('should format negative UTC offset (UTC-5)', () => {
		vi.stubEnv('TZ', 'America/New_York');
		const date = new Date('2026-01-23T14:30:00Z');
		const result = formatUTCOffset(date);
		expect(result).toBe('-05:00');
		vi.unstubAllEnvs();
	});

	it('should format negative UTC offset with minutes (UTC-3:30)', () => {
		vi.stubEnv('TZ', 'America/St_Johns');
		const date = new Date('2026-01-23T14:30:00Z');
		const result = formatUTCOffset(date);
		expect(result).toBe('-03:30');
		vi.unstubAllEnvs();
	});

	it('should format large positive offset (UTC+12)', () => {
		vi.stubEnv('TZ', 'Pacific/Auckland');
		const date = new Date('2026-01-23T14:30:00Z');
		const result = formatUTCOffset(date);
		expect(result).toBe('+13:00'); // New Zealand is UTC+13 in summer (NZDT)
		vi.unstubAllEnvs();
	});

	it('should format large negative offset (UTC-10)', () => {
		vi.stubEnv('TZ', 'Pacific/Honolulu');
		const date = new Date('2026-01-23T14:30:00Z');
		const result = formatUTCOffset(date);
		expect(result).toBe('-10:00');
		vi.unstubAllEnvs();
	});

	it('should format Tokyo timezone (UTC+9)', () => {
		vi.stubEnv('TZ', 'Asia/Tokyo');
		const date = new Date('2026-01-23T14:30:00Z');
		const result = formatUTCOffset(date);
		expect(result).toBe('+09:00');
		vi.unstubAllEnvs();
	});
});
