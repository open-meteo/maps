/**
 * Time and model-run navigation shared by the time selector and the keyboard
 * shortcuts: how a requested time or run propagates to the stores, the URL
 * and the map. The components only draw.
 */
import { get } from 'svelte/store';

import { type DomainMetaDataJson, domainStep } from '@openmeteo/weather-map-layer';
import { toast } from 'svelte-sonner';

import { loading } from '#lib/stores/preferences.js';
import {
	inProgress,
	latest,
	metaJson,
	modelRun,
	modelRunLocked,
	now,
	time
} from '#lib/stores/time.js';
import { selectedDomain } from '#lib/stores/variables.js';

import { MILLISECONDS_PER_HOUR, MILLISECONDS_PER_WEEK } from './constants';
import { changeOMfileURL } from './layers';
import { tryGetMetaData } from './metadata';
import { availableRuns, runForTime } from './model-runs';
import { formatISOWithoutTimezone } from './time-format';
import { findTimeStep } from './time-utils';
import { updateUrl } from './url';

export const validTimes = (meta: DomainMetaDataJson | undefined): Date[] =>
	meta?.valid_times.map((validTime) => new Date(validTime)) ?? [];

export const referenceTime = (meta: DomainMetaDataJson | undefined): Date | undefined =>
	meta?.reference_time ? new Date(meta.reference_time) : undefined;

export const latestRun = (): Date | undefined => referenceTime(get(latest));

/** The in-progress run, when it is a different run than the latest one. */
export const inProgressRun = (): Date | undefined => {
	const run = referenceTime(get(inProgress));
	return run && run.getTime() !== latestRun()?.getTime() ? run : undefined;
};

// The run whose metadata is on its way: scrubbing asks for the same run
// several times before it has loaded, and one load serves all of them.
let pendingRun: { run: number; done: Promise<boolean> } | undefined;

/**
 * Switches to `run` and loads its metadata. On a failed load (already
 * toasted) the previous run and metadata are put back and false returned;
 * so is false when another switch took over while this one was loading,
 * whose outcome is then not this one's to apply.
 */
const applyRun = (run: Date): Promise<boolean> => {
	if (pendingRun?.run === run.getTime()) return pendingRun.done;
	const previousRun = get(modelRun);
	const previousMeta = get(metaJson);
	modelRun.set(run);
	const done = (async () => {
		const meta = await tryGetMetaData();
		if (pendingRun?.run === run.getTime()) pendingRun = undefined;
		if (get(modelRun)?.getTime() !== run.getTime()) return false;
		if (!meta) {
			modelRun.set(previousRun);
			metaJson.set(previousMeta);
			return false;
		}
		metaJson.set(meta);
		const isLatest = run.getTime() === latestRun()?.getTime();
		updateUrl('model_run', isLatest ? undefined : formatISOWithoutTimezone(run));
		return true;
	})();
	pendingRun = { run: run.getTime(), done };
	return done;
};

const commitTime = (date: Date) => {
	time.set(date);
	updateUrl('time', formatISOWithoutTimezone(date));
	changeOMfileURL();
};

// A later selection supersedes one still waiting for its run's metadata:
// only the newest call may commit, or scrubbing would replay stale steps.
let selectionSequence = 0;

/**
 * Selects `date`: clamps it to what the server keeps, switches to the run
 * that serves it (unless the run is locked), snaps to that run's valid
 * times and updates URL and map. Resolves to the time that was committed.
 */
export const selectTime = async (date: Date): Promise<Date> => {
	const sequence = ++selectionSequence;
	const meta = get(metaJson);
	const newest = latestRun();
	if (!meta || !newest) return get(time);

	const domain = get(selectedDomain);
	const steps = validTimes(meta);
	const first = steps[0];
	const last = steps[steps.length - 1];
	let target = new Date(date);

	if (get(modelRunLocked)) {
		if (target.getTime() < first.getTime()) {
			toast.warning("Model run locked, can't go before first time");
			return get(time);
		}
		if (target.getTime() > last.getTime()) {
			toast.warning("Model run locked, can't go after last time");
			return get(time);
		}
	} else {
		// Runs older than a week are gone from the server (seasonal models aside)
		if (domain.model_interval !== 'monthly') {
			const weekAgo = Date.now() - MILLISECONDS_PER_WEEK;
			if (target.getTime() < weekAgo) {
				toast.warning('Date selected too old, using 7 days ago time');
				target = domainStep(new Date(weekAgo), domain.time_interval, 'floor');
			}
		}
		// Nothing is newer than the end of the newest run on screen
		const onNewestRun = (referenceTime(meta)?.getTime() ?? 0) >= newest.getTime();
		if (onNewestRun && target.getTime() > last.getTime()) {
			toast.warning('Date selected too new, using latest available time');
			target = new Date(last);
		}

		// Show the requested time right away; the run catches up below
		time.set(target);

		const run = runForTime(target, get(modelRun), newest, domain.model_interval, inProgressRun());
		// The run whose metadata is loaded, not the one merely selected: a switch
		// still loading must be waited for, or the time would snap to the old
		// run's steps
		if (run.getTime() !== referenceTime(meta)?.getTime()) {
			const ok = await applyRun(run);
			if (sequence !== selectionSequence) return get(time);
			if (!ok) target = new Date(findTimeStep(target, steps) ?? first);
		}
	}

	const committed = new Date(findTimeStep(target, validTimes(get(metaJson))) ?? target);
	commitTime(committed);
	return committed;
};

/**
 * Switches to an explicitly chosen run and locks it, keeping the selected
 * time where the run covers it, else its last step before that time.
 */
export const selectModelRun = async (run: Date): Promise<void> => {
	const wasLocked = get(modelRunLocked);
	loading.set(true);
	modelRunLocked.set(true);
	const ok = await applyRun(run);
	if (!ok) {
		modelRunLocked.set(wasLocked);
		loading.set(false);
		return;
	}
	const steps = validTimes(get(metaJson));
	const current = get(time).getTime();
	const kept = steps.findLast((step) => step.getTime() <= current) ?? steps[0];
	commitTime(new Date(kept));
};

/** One valid time forward or back; past the run's edge one base step into the neighbouring run. */
export const stepTime = async (direction: 1 | -1): Promise<void> => {
	const steps = validTimes(get(metaJson));
	if (steps.length === 0) return;
	const current = get(time).getTime();
	const index = steps.findLastIndex((step) => step.getTime() <= current);
	const next = steps[index + direction];
	if (next) {
		await selectTime(next);
		return;
	}
	const newest = latestRun();
	const run = get(modelRun);
	if (direction > 0 && run && newest && run.getTime() >= newest.getTime()) {
		toast.warning('Already on latest timestep');
		return;
	}
	const edge = direction > 0 ? steps[steps.length - 1] : steps[0];
	const neighbour = direction > 0 ? steps[steps.length - 2] : steps[1];
	const stepMs = neighbour ? Math.abs(edge.getTime() - neighbour.getTime()) : MILLISECONDS_PER_HOUR;
	await selectTime(new Date(edge.getTime() + direction * stepMs));
};

export const stepDay = async (direction: 1 | -1): Promise<void> => {
	const target = new Date(get(time));
	target.setUTCHours(target.getUTCHours() + 24 * direction);
	await selectTime(target);
};

/** The next newer (+1) or older (-1) run the picker offers. */
export const stepModelRun = async (direction: 1 | -1): Promise<void> => {
	const run = get(modelRun);
	const newest = latestRun();
	if (!run || !newest) return;
	const runs = availableRuns(newest, get(selectedDomain).model_interval, inProgressRun());
	const index = runs.findIndex((candidate) => candidate.getTime() === run.getTime());
	const next = index === -1 ? undefined : runs[index - direction];
	if (!next) {
		toast.warning(direction > 0 ? 'Already on latest model run' : 'Already on oldest model run');
		return;
	}
	await selectModelRun(next);
};

/** The first step at or after now, or the nearest one when the run has ended. */
export const jumpToNow = async (): Promise<void> => {
	const steps = validTimes(get(metaJson));
	const current = get(now).getTime();
	const next = steps.find((step) => step.getTime() >= current) ?? findTimeStep(get(now), steps);
	if (next) await selectTime(next);
};

export const toggleModelRunLock = (): void => {
	modelRunLocked.update((locked) => !locked);
	toast.info(get(modelRunLocked) ? 'Model run locked' : 'Model run unlocked');
};

export const selectLatestModelRun = async (): Promise<void> => {
	const newest = latestRun();
	if (!newest) return;
	if (get(modelRun)?.getTime() === newest.getTime()) {
		toast.warning('Already on latest model run');
		return;
	}
	await selectModelRun(newest);
};
