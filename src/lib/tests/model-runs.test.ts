import { describe, expect, it } from 'vitest';

import { ARCHIVE_START } from '#lib/archive.js';
import { MILLISECONDS_PER_WEEK } from '#lib/constants.js';
import { domainOptions } from '#lib/domains.js';
import {
	ARCHIVE_AXIS_MARGIN,
	type RunCatalogue,
	availableRuns,
	axisSpan,
	runCatalogue,
	runForTime,
	runHistory
} from '#lib/model-runs.js';

const latest = new Date('2026-11-11T06:00:00Z');
const hour = (n: number) => new Date(latest.getTime() + n * 3600_000);
const find = (value: string) => domainOptions.find((domain) => domain.value === value)!;

describe('runHistory', () => {
	it('lists the latest run and the week before it at the model interval, newest first', () => {
		const runs = runHistory(latest, '6_hourly');
		expect(runs[0]).toEqual(latest);
		expect(runs[1]).toEqual(hour(-6));
		expect(runs.length).toBe(Math.floor((6.9 * 24) / 6));
		expect(runs[runs.length - 1].getTime()).toBeGreaterThan(
			latest.getTime() - MILLISECONDS_PER_WEEK
		);
	});

	it('drops minutes of an odd latest reference time', () => {
		const runs = runHistory(new Date('2026-11-11T06:30:00Z'), 'hourly');
		expect(runs[0]).toEqual(latest);
	});
});

describe('runCatalogue', () => {
	it('keeps a week of runs for a served domain', () => {
		const catalogue = runCatalogue(find('ncep_gfs025'), latest);
		expect(catalogue.kind).toBe('server');
		expect(catalogue.newest).toEqual(latest);
		expect(catalogue.oldest).toEqual(runHistory(latest, '6_hourly').at(-1));
	});

	it('reaches back to the archive start for an archive domain', () => {
		const catalogue = runCatalogue(find('ncep_gfs025_archive'), latest);
		expect(catalogue.kind).toBe('archive');
		expect(catalogue.oldest).toEqual(ARCHIVE_START);
		expect(catalogue.newest).toEqual(latest);
	});
});

const server: RunCatalogue = runCatalogue(find('ncep_gfs025'), latest);
const archive: RunCatalogue = runCatalogue(find('ncep_gfs025_archive'), latest);

describe('availableRuns', () => {
	it('puts the in-progress run first when there is one', () => {
		const running = hour(6);
		expect(availableRuns(server, latest, running)[0]).toEqual(running);
		expect(availableRuns(server, latest)[0]).toEqual(latest);
	});

	it('is the week ending at the given run of an archive, never past its edges', () => {
		const around = new Date('2023-06-01T12:00:00Z');
		const runs = availableRuns(archive, around);
		expect(runs[0]).toEqual(around);
		expect(runs.length).toBe(runHistory(around, '6_hourly').length);
		expect(availableRuns(archive, hour(24))[0]).toEqual(latest);
		const first = availableRuns(archive, new Date('2021-01-02T00:00:00Z'));
		expect(first.at(-1)).toEqual(ARCHIVE_START);
	});
});

describe('runForTime', () => {
	it('is the newest run that has started by the time, capped at the latest run', () => {
		expect(runForTime(hour(1), latest, server)).toEqual(latest);
		expect(runForTime(hour(30), latest, server)).toEqual(latest);
		expect(runForTime(hour(-1), latest, server)).toEqual(hour(-6));
		expect(runForTime(hour(-13), hour(-6), server)).toEqual(hour(-18));
	});

	it('moves forward to a newer run once the time passes its start', () => {
		expect(runForTime(hour(-5), hour(-12), server)).toEqual(hour(-6));
	});

	it('never goes before the oldest kept run', () => {
		expect(runForTime(hour(-30 * 24), latest, server)).toEqual(server.oldest);
		expect(runForTime(new Date('2020-05-01T00:00:00Z'), latest, archive)).toEqual(ARCHIVE_START);
		expect(runForTime(new Date('2023-06-01T14:00:00Z'), latest, archive)).toEqual(
			new Date('2023-06-01T12:00:00Z')
		);
	});

	it('keeps the in-progress run while it is selected and covers the time', () => {
		const running = hour(6);
		expect(runForTime(hour(8), running, server, running)).toEqual(running);
		expect(runForTime(hour(8), latest, server, running)).toEqual(latest);
		expect(runForTime(hour(2), running, server, running)).toEqual(latest);
	});
});

describe('axisSpan', () => {
	const runRange: [number, number] = [hour(-48).getTime(), hour(-48 + 384).getTime()];
	const latestLast = hour(384).getTime();

	it('shows the server week up to the end of the newest run', () => {
		const [start, end] = axisSpan(server, runRange, latestLast, latest.getTime());
		expect(start).toBe(
			Math.min(
				runRange[0],
				Math.max(server.oldest.getTime(), latest.getTime() - MILLISECONDS_PER_WEEK)
			)
		);
		expect(end).toBe(latestLast);
	});

	const old: [number, number] = [
		Date.UTC(2023, 5, 1, 12),
		Date.UTC(2023, 5, 1, 12) + 384 * 3600_000
	];

	it('shows a window around an archived run instead of the archive', () => {
		const [start, end] = axisSpan(archive, old, latestLast, latest.getTime());
		expect(start).toBe(old[0] - ARCHIVE_AXIS_MARGIN);
		expect(end).toBe(old[1] + ARCHIVE_AXIS_MARGIN);
		const [first] = axisSpan(
			archive,
			[ARCHIVE_START.getTime(), old[1]],
			latestLast,
			latest.getTime()
		);
		expect(first).toBe(ARCHIVE_START.getTime());
	});

	it('keeps the archive window while the run stays inside it', () => {
		const window = axisSpan(archive, old, latestLast, latest.getTime());
		const shifted: [number, number] = [old[0] - 6 * 3600_000, old[1] - 6 * 3600_000];
		expect(axisSpan(archive, shifted, latestLast, latest.getTime(), window)).toBe(window);
		const outside: [number, number] = [old[0] - 3 * MILLISECONDS_PER_WEEK, old[1]];
		expect(axisSpan(archive, outside, latestLast, latest.getTime(), window)[0]).toBe(
			outside[0] - ARCHIVE_AXIS_MARGIN
		);
	});
});
