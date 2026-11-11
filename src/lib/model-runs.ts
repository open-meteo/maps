/**
 * Which model runs a domain's source keeps and which one serves a given
 * time. Pure date arithmetic, shared by the time navigation, the run picker
 * and the time selector's axis.
 */
import { type Domain, closestModelRun } from '@openmeteo/weather-map-layer';

import { ARCHIVE_START, archiveDomain } from './archive';
import { MILLISECONDS_PER_WEEK } from './constants';

/** The `model_interval` of a domain: how often it runs. */
export type ModelInterval = Domain['model_interval'];

/** How many days of runs the data server keeps next to the latest one. */
export const RUN_HISTORY_DAYS = 6.9;

/** How far an archive's axis reaches beyond the selected run on either side. */
export const ARCHIVE_AXIS_MARGIN = 2 * MILLISECONDS_PER_WEEK;

/**
 * The runs a domain can be read at. The data server keeps a week of runs and
 * drops a run's files after a week; an archive holds every run since its
 * start and never drops one.
 */
export interface RunCatalogue {
	kind: 'server' | 'archive';
	interval: ModelInterval;
	oldest: Date;
	newest: Date;
}

export const modelIntervalHours = (interval: ModelInterval): number => {
	switch (interval) {
		case '3_hourly':
			return 3;
		case '6_hourly':
			return 6;
		case '12_hourly':
			return 12;
		case 'daily':
			return 24;
		case 'monthly':
			return 720;
		default:
			return 1;
	}
};

/** `latestRun` and the runs of the week before it, newest first. */
export const runHistory = (latestRun: Date, interval: ModelInterval): Date[] => {
	const hours = modelIntervalHours(interval);
	const count = Math.floor((RUN_HISTORY_DAYS * 24) / hours);
	const base = new Date(latestRun);
	base.setUTCMinutes(0, 0, 0);
	return Array.from({ length: count }, (_, i) => {
		const run = new Date(base);
		run.setUTCHours(base.getUTCHours() - i * hours);
		return run;
	});
};

export const runCatalogue = (domain: Domain, latestRun: Date): RunCatalogue => {
	const interval = domain.model_interval;
	if (archiveDomain(domain.value)) {
		return { kind: 'archive', interval, oldest: ARCHIVE_START, newest: latestRun };
	}
	const history = runHistory(latestRun, interval);
	return { kind: 'server', interval, oldest: history[history.length - 1], newest: latestRun };
};

/**
 * The runs the picker offers around `around`, newest first: the in-progress
 * run when there is one, then a week of runs ending at `around` (the newest
 * run for the server, whose week is all there is).
 */
export const availableRuns = (
	catalogue: RunCatalogue,
	around: Date,
	inProgressRun?: Date
): Date[] => {
	const end = new Date(Math.min(around.getTime(), catalogue.newest.getTime()));
	const history = runHistory(end, catalogue.interval).filter(
		(run) => run.getTime() >= catalogue.oldest.getTime()
	);
	return inProgressRun ? [inProgressRun, ...history] : history;
};

/**
 * The run that should show `time`: the newest kept run that has started by
 * then, the oldest kept one for anything earlier. The in-progress run is only
 * ever chosen explicitly, so it is kept while it is selected and covers the
 * time, and left as soon as the time goes before its start.
 */
export const runForTime = (
	time: Date,
	current: Date | undefined,
	catalogue: RunCatalogue,
	inProgressRun?: Date
): Date => {
	if (
		inProgressRun &&
		current?.getTime() === inProgressRun.getTime() &&
		time.getTime() >= inProgressRun.getTime()
	) {
		return inProgressRun;
	}
	const nearest = closestModelRun(time, catalogue.interval).getTime();
	return new Date(
		Math.max(catalogue.oldest.getTime(), Math.min(nearest, catalogue.newest.getTime()))
	);
};

/**
 * The span the time selector's axis shows for the selected run: the server's
 * whole week of runs up to the end of the newest one. An archive's full
 * extent is years, so its axis is a window with a margin on either side of
 * the run; the window (`previous`) stays put while the run stays inside it,
 * so that scrubbing from run to run does not move the track under the pointer.
 */
export const axisSpan = (
	catalogue: RunCatalogue,
	runRange: [number, number],
	latestLast: number,
	now: number,
	previous?: [number, number]
): [number, number] => {
	const [runFirst, runLast] = runRange;
	if (catalogue.kind === 'archive') {
		if (previous && runFirst >= previous[0] && runLast <= previous[1]) return previous;
		const start = Math.max(catalogue.oldest.getTime(), runFirst - ARCHIVE_AXIS_MARGIN);
		const end = Math.max(runLast, Math.min(latestLast, runLast + ARCHIVE_AXIS_MARGIN));
		return [start, end];
	}
	// Seasonal (monthly) runs stay around; anything else is gone after a week
	const kept =
		catalogue.interval === 'monthly' ? catalogue.oldest.getTime() : now - MILLISECONDS_PER_WEEK;
	const start = Math.min(runFirst, Math.max(catalogue.oldest.getTime(), kept));
	return [start, Math.max(runLast, latestLast)];
};
