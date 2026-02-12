import { SvelteDate } from 'svelte/reactivity';

import { describe, expect, it } from 'vitest';

import { findTimeStep } from '$lib/time-utils';

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

	it('should find the closest timestep when no exact match', () => {
		const timeSteps = [
			new Date('2026-01-22T10:00:00Z'),
			new Date('2026-01-22T11:00:00Z'),
			new Date('2026-01-22T12:00:00Z'),
			new Date('2026-01-22T13:00:00Z')
		];
		const date = new Date('2026-01-22T12:40:00Z'); // Closer to 13:00

		const result = findTimeStep(date, timeSteps);

		expect(result?.getTime()).toBe(timeSteps[3].getTime()); // Should return 13:00
	});

	it('should return the first timestep when date is before all timesteps', () => {
		const timeSteps = [
			new Date('2026-01-22T10:00:00Z'),
			new Date('2026-01-22T11:00:00Z'),
			new Date('2026-01-22T12:00:00Z')
		];
		const date = new Date('2026-01-22T09:00:00Z'); // Before all timesteps

		const result = findTimeStep(date, timeSteps);

		expect(result?.getTime()).toBe(timeSteps[0].getTime());
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
		const date = new SvelteDate('2026-01-22T11:40:00Z');

		const result = findTimeStep(date, timeSteps);

		expect(result?.getTime()).toBe(timeSteps[2].getTime());
	});

	it('should work with mixed Date and SvelteDate', () => {
		const timeSteps = [
			new Date('2026-01-22T10:00:00Z'),
			new Date('2026-01-22T11:00:00Z'),
			new Date('2026-01-22T12:00:00Z')
		];
		const date = new SvelteDate('2026-01-22T11:40:00Z');

		const result = findTimeStep(date, timeSteps);

		expect(result?.getTime()).toBe(timeSteps[2].getTime());
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

		expect(result?.getTime()).toBe(timeSteps[3].getTime()); // Should return Jan 23
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
});
