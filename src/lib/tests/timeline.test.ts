import { describe, expect, it } from 'vitest';

import {
	axisWidth,
	buildAxis,
	dayBands,
	firstStepFrom,
	snapToStep,
	stepOf,
	timeToX,
	xToTime
} from '#lib/components/time/timeline.js';

import { MILLISECONDS_PER_HOUR } from '#lib/constants.js';

const HOUR = MILLISECONDS_PER_HOUR;
const first = new Date('2026-11-04T06:00:00Z');
const last = new Date('2026-11-16T06:00:00Z');

describe('buildAxis', () => {
	it('opens at the local midnight before the first time and closes on the last', () => {
		const axis = buildAxis(first, last, HOUR, first);
		const start = new Date(axis.start);
		expect([start.getHours(), start.getMinutes()]).toEqual([0, 0]);
		expect(axis.start).toBeLessThanOrEqual(first.getTime());
		expect(first.getTime() - axis.start).toBeLessThan(24 * HOUR);
		expect(axis.end).toBe(last.getTime());
	});

	it('gives 15-minute data twice the pixel density', () => {
		expect(buildAxis(first, last, HOUR, first).pxPerHour).toBe(8);
		expect(buildAxis(first, last, HOUR / 4, first).pxPerHour).toBe(16);
	});
});

describe('timeToX / xToTime', () => {
	const axis = buildAxis(first, last, HOUR, first);

	it('round-trips and scales with the pixel density', () => {
		const time = first.getTime() + 37 * HOUR;
		expect(xToTime(axis, timeToX(axis, time))).toBeCloseTo(time, 5);
		expect(timeToX(axis, axis.start + HOUR)).toBe(axis.pxPerHour);
		expect(axisWidth(axis)).toBe(timeToX(axis, axis.end));
	});
});

describe('snapToStep', () => {
	const axis = buildAxis(first, last, 3 * HOUR, first);

	it('rounds to the step grid anchored on the first valid time', () => {
		const target = first.getTime() + 4 * HOUR;
		expect(snapToStep(axis, target)).toBe(first.getTime() + 3 * HOUR);
		expect(snapToStep(axis, first.getTime() + 5 * HOUR)).toBe(first.getTime() + 6 * HOUR);
	});

	it('stays within the axis', () => {
		expect(snapToStep(axis, axis.start - 10 * HOUR)).toBe(firstStepFrom(axis, axis.start));
		expect(snapToStep(axis, axis.end + 10 * HOUR)).toBe(axis.end);
	});

	it('keeps the grid when the anchor is not the axis start', () => {
		const anchor = new Date('2026-11-05T06:00:00Z');
		const shifted = buildAxis(first, last, 3 * HOUR, anchor);
		expect(
			Math.abs((snapToStep(shifted, first.getTime() + HOUR) - anchor.getTime()) % (3 * HOUR))
		).toBe(0);
	});
});

describe('dayBands', () => {
	it('covers the axis with one band per calendar day, the last one cut at the end', () => {
		const axis = buildAxis(first, last, HOUR, first);
		const bands = dayBands(axis);
		expect(bands[0].start).toBe(axis.start);
		expect(bands[bands.length - 1].end).toBe(axis.end);
		for (let i = 1; i < bands.length; i++) {
			expect(bands[i].start).toBe(bands[i - 1].end);
			const start = new Date(bands[i].start);
			expect([start.getHours(), start.getMinutes()]).toEqual([0, 0]);
		}
		// Twelve full days plus the two partial ones at either end
		expect(bands.length).toBeGreaterThanOrEqual(12);
		expect(bands.length).toBeLessThanOrEqual(14);
	});

	it('records where the step grid enters each band', () => {
		const axis = buildAxis(first, last, 3 * HOUR, first);
		for (const band of dayBands(axis)) {
			expect(band.firstStep).toBeGreaterThanOrEqual(band.start);
			expect(band.firstStep - band.start).toBeLessThan(3 * HOUR);
			expect(Math.abs((band.firstStep - axis.anchor) % (3 * HOUR))).toBe(0);
		}
	});
});

describe('stepOf', () => {
	it('is the gap between the first two valid times, an hour for a single one', () => {
		expect(stepOf([new Date(0), new Date(3 * HOUR), new Date(9 * HOUR)])).toBe(3 * HOUR);
		expect(stepOf([new Date(0)])).toBe(HOUR);
		expect(stepOf([])).toBe(HOUR);
	});
});
