import { describe, expect, it } from 'vitest';

import { availableRuns, runForTime, runHistory } from '#lib/model-runs.js';

const latest = new Date('2026-11-11T06:00:00Z');
const hour = (n: number) => new Date(latest.getTime() + n * 3600_000);

describe('runHistory', () => {
	it('lists the latest run and the week before it at the model interval, newest first', () => {
		const runs = runHistory(latest, '6_hourly');
		expect(runs[0]).toEqual(latest);
		expect(runs[1]).toEqual(hour(-6));
		expect(runs.length).toBe(Math.floor((6.9 * 24) / 6));
		expect(runs[runs.length - 1].getTime()).toBeGreaterThan(latest.getTime() - 7 * 24 * 3600_000);
	});

	it('drops minutes of an odd latest reference time', () => {
		const runs = runHistory(new Date('2026-11-11T06:30:00Z'), 'hourly');
		expect(runs[0]).toEqual(latest);
	});
});

describe('availableRuns', () => {
	it('puts the in-progress run first when there is one', () => {
		const running = hour(6);
		expect(availableRuns(latest, '6_hourly', running)[0]).toEqual(running);
		expect(availableRuns(latest, '6_hourly')[0]).toEqual(latest);
	});
});

describe('runForTime', () => {
	it('is the newest run that has started by the time, capped at the latest run', () => {
		expect(runForTime(hour(1), latest, latest, '6_hourly')).toEqual(latest);
		expect(runForTime(hour(30), latest, latest, '6_hourly')).toEqual(latest);
		expect(runForTime(hour(-1), latest, latest, '6_hourly')).toEqual(hour(-6));
		expect(runForTime(hour(-13), hour(-6), latest, '6_hourly')).toEqual(hour(-18));
	});

	it('moves forward to a newer run once the time passes its start', () => {
		expect(runForTime(hour(-5), hour(-12), latest, '6_hourly')).toEqual(hour(-6));
	});

	it('never goes before the oldest kept run', () => {
		const runs = runHistory(latest, '6_hourly');
		const oldest = runs[runs.length - 1];
		expect(runForTime(hour(-30 * 24), latest, latest, '6_hourly')).toEqual(oldest);
	});

	it('keeps the in-progress run while it is selected and covers the time', () => {
		const running = hour(6);
		expect(runForTime(hour(8), running, latest, '6_hourly', running)).toEqual(running);
		expect(runForTime(hour(8), latest, latest, '6_hourly', running)).toEqual(latest);
		expect(runForTime(hour(2), running, latest, '6_hourly', running)).toEqual(latest);
	});
});
