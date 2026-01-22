import { SvelteDate } from 'svelte/reactivity';

import { describe, expect, it } from 'vitest';

import { findTimeStep, findTimeStepIndex } from '$lib/time-utils';

describe('findTimeStep', () => {
	it('should return undefined when timeSteps is undefined', () => {
		const date = new Date('2026-01-22T12:00:00Z');
		const result = findTimeStep(date, undefined);

		expect(result).toBeUndefined();
	});

	it('should return undefined when timeSteps is empty', () => {
		const date = new Date('2026-01-22T12:00:00Z');
		const result = findTimeStep(date, []);

		expect(result).toBeUndefined();
	});

	it('should find the exact matching timestep', () => {
		const timeSteps = [
			new Date('2026-01-22T10:00:00Z'),
			new Date('2026-01-22T11:00:00Z'),
			new Date('2026-01-22T12:00:00Z'),
			new Date('2026-01-22T13:00:00Z')
		];
		const date = new Date('2026-01-22T12:00:00Z');

		const result = findTimeStep(date, timeSteps);

		expect(result?.getTime()).toBe(date.getTime());
	});

	it('should find the closest previous timestep when no exact match', () => {
		const timeSteps = [
			new Date('2026-01-22T10:00:00Z'),
			new Date('2026-01-22T11:00:00Z'),
			new Date('2026-01-22T12:00:00Z'),
			new Date('2026-01-22T13:00:00Z')
		];
		const date = new Date('2026-01-22T12:30:00Z'); // Between 12:00 and 13:00

		const result = findTimeStep(date, timeSteps);

		expect(result?.getTime()).toBe(timeSteps[2].getTime()); // Should return 12:00
	});

	it('should return undefined when date is before all timesteps', () => {
		const timeSteps = [
			new Date('2026-01-22T10:00:00Z'),
			new Date('2026-01-22T11:00:00Z'),
			new Date('2026-01-22T12:00:00Z')
		];
		const date = new Date('2026-01-22T09:00:00Z'); // Before all timesteps

		const result = findTimeStep(date, timeSteps);

		expect(result).toBeUndefined();
	});

	it('should return the last timestep when date is after all timesteps', () => {
		const timeSteps = [
			new Date('2026-01-22T10:00:00Z'),
			new Date('2026-01-22T11:00:00Z'),
			new Date('2026-01-22T12:00:00Z')
		];
		const date = new Date('2026-01-22T15:00:00Z'); // After all timesteps

		const result = findTimeStep(date, timeSteps);

		expect(result?.getTime()).toBe(timeSteps[2].getTime()); // Should return last timestep
	});

	it('should work with SvelteDate instances', () => {
		const timeSteps = [
			new SvelteDate('2026-01-22T10:00:00Z'),
			new SvelteDate('2026-01-22T11:00:00Z'),
			new SvelteDate('2026-01-22T12:00:00Z')
		];
		const date = new SvelteDate('2026-01-22T11:30:00Z');

		const result = findTimeStep(date, timeSteps);

		expect(result?.getTime()).toBe(timeSteps[1].getTime());
	});

	it('should work with mixed Date and SvelteDate', () => {
		const timeSteps = [
			new Date('2026-01-22T10:00:00Z'),
			new Date('2026-01-22T11:00:00Z'),
			new Date('2026-01-22T12:00:00Z')
		];
		const date = new SvelteDate('2026-01-22T11:30:00Z');

		const result = findTimeStep(date, timeSteps);

		expect(result?.getTime()).toBe(timeSteps[1].getTime());
	});

	it('should handle 15-minute intervals', () => {
		const timeSteps = [
			new Date('2026-01-22T10:00:00Z'),
			new Date('2026-01-22T10:15:00Z'),
			new Date('2026-01-22T10:30:00Z'),
			new Date('2026-01-22T10:45:00Z'),
			new Date('2026-01-22T11:00:00Z')
		];
		const date = new Date('2026-01-22T10:37:00Z');

		const result = findTimeStep(date, timeSteps);

		expect(result?.getTime()).toBe(timeSteps[2].getTime()); // Should return 10:30
	});

	it('should handle 3-hourly intervals', () => {
		const timeSteps = [
			new Date('2026-01-22T00:00:00Z'),
			new Date('2026-01-22T03:00:00Z'),
			new Date('2026-01-22T06:00:00Z'),
			new Date('2026-01-22T09:00:00Z'),
			new Date('2026-01-22T12:00:00Z')
		];
		const date = new Date('2026-01-22T10:00:00Z');

		const result = findTimeStep(date, timeSteps);

		expect(result?.getTime()).toBe(timeSteps[3].getTime()); // Should return 09:00
	});

	it('should handle daily intervals', () => {
		const timeSteps = [
			new Date('2026-01-20T00:00:00Z'),
			new Date('2026-01-21T00:00:00Z'),
			new Date('2026-01-22T00:00:00Z'),
			new Date('2026-01-23T00:00:00Z')
		];
		const date = new Date('2026-01-22T15:00:00Z');

		const result = findTimeStep(date, timeSteps);

		expect(result?.getTime()).toBe(timeSteps[2].getTime()); // Should return Jan 22
	});

	it('should handle single timestep array', () => {
		const timeSteps = [new Date('2026-01-22T12:00:00Z')];
		const date = new Date('2026-01-22T15:00:00Z');

		const result = findTimeStep(date, timeSteps);

		expect(result?.getTime()).toBe(timeSteps[0].getTime());
	});

	it('should handle timesteps with milliseconds', () => {
		const timeSteps = [
			new Date('2026-01-22T10:00:00.000Z'),
			new Date('2026-01-22T10:00:00.500Z'),
			new Date('2026-01-22T10:00:01.000Z')
		];
		const date = new Date('2026-01-22T10:00:00.750Z');

		const result = findTimeStep(date, timeSteps);

		expect(result?.getTime()).toBe(timeSteps[1].getTime());
	});

	it('should handle edge case of date exactly at first timestep', () => {
		const timeSteps = [
			new Date('2026-01-22T10:00:00Z'),
			new Date('2026-01-22T11:00:00Z'),
			new Date('2026-01-22T12:00:00Z')
		];
		const date = new Date('2026-01-22T10:00:00Z');

		const result = findTimeStep(date, timeSteps);

		expect(result?.getTime()).toBe(timeSteps[0].getTime());
	});

	it('should handle edge case of date exactly at last timestep', () => {
		const timeSteps = [
			new Date('2026-01-22T10:00:00Z'),
			new Date('2026-01-22T11:00:00Z'),
			new Date('2026-01-22T12:00:00Z')
		];
		const date = new Date('2026-01-22T12:00:00Z');

		const result = findTimeStep(date, timeSteps);

		expect(result?.getTime()).toBe(timeSteps[2].getTime());
	});

	it('should handle unsorted timesteps (edge case)', () => {
		// Note: In production, timesteps should always be sorted
		// But this tests robustness
		const timeSteps = [
			new Date('2026-01-22T12:00:00Z'),
			new Date('2026-01-22T10:00:00Z'),
			new Date('2026-01-22T11:00:00Z')
		];
		const date = new Date('2026-01-22T11:30:00Z');

		const result = findTimeStep(date, timeSteps);

		// findLast will find the last occurrence <= date
		// In this case, it's the last element (11:00)
		expect(result?.getTime()).toBe(timeSteps[2].getTime());
	});
});

describe('findTimeStepIndex', () => {
	it('should return -1 when timeSteps is undefined', () => {
		const date = new Date('2026-01-22T12:00:00Z');
		const result = findTimeStepIndex(date, undefined);

		expect(result).toBe(-1);
	});

	it('should return -1 when timeSteps is empty', () => {
		const date = new Date('2026-01-22T12:00:00Z');
		const result = findTimeStepIndex(date, []);

		expect(result).toBe(-1);
	});

	it('should return the correct index for exact match', () => {
		const timeSteps = [
			new Date('2026-01-22T10:00:00Z'),
			new Date('2026-01-22T11:00:00Z'),
			new Date('2026-01-22T12:00:00Z'),
			new Date('2026-01-22T13:00:00Z')
		];
		const date = new Date('2026-01-22T12:00:00Z');

		const result = findTimeStepIndex(date, timeSteps);

		expect(result).toBe(2);
	});

	it('should return the index of closest previous timestep', () => {
		const timeSteps = [
			new Date('2026-01-22T10:00:00Z'),
			new Date('2026-01-22T11:00:00Z'),
			new Date('2026-01-22T12:00:00Z'),
			new Date('2026-01-22T13:00:00Z')
		];
		const date = new Date('2026-01-22T12:30:00Z');

		const result = findTimeStepIndex(date, timeSteps);

		expect(result).toBe(2); // Index of 12:00
	});

	it('should return -1 when date is before all timesteps', () => {
		const timeSteps = [
			new Date('2026-01-22T10:00:00Z'),
			new Date('2026-01-22T11:00:00Z'),
			new Date('2026-01-22T12:00:00Z')
		];
		const date = new Date('2026-01-22T09:00:00Z');

		const result = findTimeStepIndex(date, timeSteps);

		expect(result).toBe(-1);
	});

	it('should return the last index when date is after all timesteps', () => {
		const timeSteps = [
			new Date('2026-01-22T10:00:00Z'),
			new Date('2026-01-22T11:00:00Z'),
			new Date('2026-01-22T12:00:00Z')
		];
		const date = new Date('2026-01-22T15:00:00Z');

		const result = findTimeStepIndex(date, timeSteps);

		expect(result).toBe(2); // Last index
	});

	it('should return 0 for first timestep', () => {
		const timeSteps = [
			new Date('2026-01-22T10:00:00Z'),
			new Date('2026-01-22T11:00:00Z'),
			new Date('2026-01-22T12:00:00Z')
		];
		const date = new Date('2026-01-22T10:00:00Z');

		const result = findTimeStepIndex(date, timeSteps);

		expect(result).toBe(0);
	});

	it('should work with SvelteDate instances', () => {
		const timeSteps = [
			new SvelteDate('2026-01-22T10:00:00Z'),
			new SvelteDate('2026-01-22T11:00:00Z'),
			new SvelteDate('2026-01-22T12:00:00Z')
		];
		const date = new SvelteDate('2026-01-22T11:30:00Z');

		const result = findTimeStepIndex(date, timeSteps);

		expect(result).toBe(1);
	});

	it('should be consistent with findTimeStep result', () => {
		const timeSteps = [
			new Date('2026-01-22T10:00:00Z'),
			new Date('2026-01-22T11:00:00Z'),
			new Date('2026-01-22T12:00:00Z'),
			new Date('2026-01-22T13:00:00Z')
		];
		const date = new Date('2026-01-22T12:45:00Z');

		const timeStep = findTimeStep(date, timeSteps);
		const index = findTimeStepIndex(date, timeSteps);

		expect(timeSteps[index]).toBe(timeStep);
	});
});

describe('findTimeStep edge cases and real-world scenarios', () => {
	it('should handle forecast data spanning multiple days', () => {
		const timeSteps: Date[] = [];
		const baseDate = new Date('2026-01-22T00:00:00Z');

		// Generate 7 days of hourly data
		for (let day = 0; day < 7; day++) {
			for (let hour = 0; hour < 24; hour++) {
				const date = new Date(baseDate);
				date.setUTCDate(date.getUTCDate() + day);
				date.setUTCHours(hour);
				timeSteps.push(date);
			}
		}

		const testDate = new Date('2026-01-24T15:30:00Z'); // Day 2, 3:30 PM
		const result = findTimeStep(testDate, timeSteps);

		expect(result).toBeDefined();
		expect(result!.getUTCDate()).toBe(24);
		expect(result!.getUTCHours()).toBe(15);
	});

	it('should handle timezone differences correctly (UTC)', () => {
		const timeSteps = [
			new Date('2026-01-22T00:00:00Z'),
			new Date('2026-01-22T03:00:00Z'),
			new Date('2026-01-22T06:00:00Z')
		];
		// User in different timezone but date is in UTC
		const date = new Date('2026-01-22T04:00:00Z');

		const result = findTimeStep(date, timeSteps);

		expect(result?.getTime()).toBe(timeSteps[1].getTime());
	});

	it('should handle model run changes (real Open-Meteo scenario)', () => {
		// Simulates switching between different model runs
		const modelRun1 = [
			new Date('2026-01-22T00:00:00Z'),
			new Date('2026-01-22T01:00:00Z'),
			new Date('2026-01-22T02:00:00Z')
		];

		const modelRun2 = [
			new Date('2026-01-22T06:00:00Z'),
			new Date('2026-01-22T07:00:00Z'),
			new Date('2026-01-22T08:00:00Z')
		];

		const date = new Date('2026-01-22T01:30:00Z');

		// In first model run
		const result1 = findTimeStep(date, modelRun1);
		expect(result1?.getUTCHours()).toBe(1);

		// In second model run, date is before all timesteps
		const result2 = findTimeStep(date, modelRun2);
		expect(result2).toBeUndefined();
	});
});
