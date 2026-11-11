/**
 * Which model runs the data server keeps and which one serves a given time.
 * Pure date arithmetic, shared by the time navigation and the run picker.
 */
import { type Domain, closestModelRun } from '@openmeteo/weather-map-layer';

/** The `model_interval` of a domain: how often it runs. */
export type ModelInterval = Domain['model_interval'];

/** How many days of runs the data server keeps next to the latest one. */
export const RUN_HISTORY_DAYS = 6.9;

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

/** The latest run and the ones of the week before it, newest first. */
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

/** Every run the picker offers, newest first: the in-progress one, then the kept history. */
export const availableRuns = (
	latestRun: Date,
	interval: ModelInterval,
	inProgressRun?: Date
): Date[] => {
	const history = runHistory(latestRun, interval);
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
	latestRun: Date,
	interval: ModelInterval,
	inProgressRun?: Date
): Date => {
	if (
		inProgressRun &&
		current?.getTime() === inProgressRun.getTime() &&
		time.getTime() >= inProgressRun.getTime()
	) {
		return inProgressRun;
	}
	const nearest = closestModelRun(time, interval).getTime();
	const history = runHistory(latestRun, interval);
	const oldest = history[history.length - 1].getTime();
	return new Date(Math.max(oldest, Math.min(nearest, latestRun.getTime())));
};
