import { SvelteDate } from 'svelte/reactivity';

import { describe, expect, it } from 'vitest';

import {
    formatLocalDate,
    formatLocalDateTime,
    formatLocalTime,
    formatUTCDate,
    formatUTCDateTime,
    formatUTCTime,
    isValidTimeStep,
    startOfLocalDay,
    withLocalTime
} from '$lib/time-format';

describe('formatLocalTime', () => {
    it('should format time in local timezone', () => {
        const date = new Date('2026-01-23T14:30:00Z');
        const result = formatLocalTime(date);
        // Result depends on local timezone, but should be in HH:MM format
        expect(result).toMatch(/^\d{2}:\d{2}$/);
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
