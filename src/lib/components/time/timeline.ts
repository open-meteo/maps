/**
 * Geometry of the time axis the selector scrolls through: a continuous
 * mapping between instants and pixels, plus the step grid the selection
 * snaps to. Kept free of DOM and stores so it can be unit tested.
 */
import { MILLISECONDS_PER_HOUR } from '#lib/constants.js';
import { startOfLocalDay } from '#lib/time-format.js';

export interface TimelineAxis {
	/** First instant on the axis, a local midnight so day bands start at their edge. */
	start: number;
	/** Last instant on the axis, the last selectable step. */
	end: number;
	/** Distance between two selectable steps. */
	stepMs: number;
	/** An instant that lies on the step grid (the run's first valid time). */
	anchor: number;
	pxPerHour: number;
}

export interface DayBand {
	start: number;
	end: number;
	/** The instant the band's first step grid line falls on. */
	firstStep: number;
}

/** Hour pixel density: 15-minute data needs room for four ticks per hour. */
export const pxPerHourFor = (stepMs: number): number => (stepMs < MILLISECONDS_PER_HOUR ? 16 : 8);

export const axisWidth = (axis: TimelineAxis): number => timeToX(axis, axis.end);

export const timeToX = (axis: TimelineAxis, time: number): number =>
	((time - axis.start) / MILLISECONDS_PER_HOUR) * axis.pxPerHour;

export const xToTime = (axis: TimelineAxis, x: number): number =>
	axis.start + (x / axis.pxPerHour) * MILLISECONDS_PER_HOUR;

/** The step grid instant nearest to `time`, within the axis. */
export const snapToStep = (axis: TimelineAxis, time: number): number => {
	const steps = Math.round((time - axis.anchor) / axis.stepMs);
	const snapped = axis.anchor + steps * axis.stepMs;
	return Math.min(Math.max(snapped, firstStepFrom(axis, axis.start)), axis.end);
};

/** The first step grid instant at or after `time`. */
export const firstStepFrom = (axis: TimelineAxis, time: number): number => {
	const steps = Math.ceil((time - axis.anchor) / axis.stepMs);
	return axis.anchor + steps * axis.stepMs;
};

/**
 * Builds the axis covering `first` to `last`: it opens at the local midnight
 * before `first` so the first day band is complete, and closes on `last`
 * itself rather than at the end of that day. `anchor` is a valid time of the
 * selected run, which fixes where the step grid lies.
 */
export const buildAxis = (first: Date, last: Date, stepMs: number, anchor: Date): TimelineAxis => ({
	start: startOfLocalDay(first).getTime(),
	end: last.getTime(),
	stepMs,
	anchor: anchor.getTime(),
	pxPerHour: pxPerHourFor(stepMs)
});

/** One band per local calendar day the axis touches, in order. */
export const dayBands = (axis: TimelineAxis): DayBand[] => {
	const bands: DayBand[] = [];
	const day = new Date(axis.start);
	while (day.getTime() < axis.end) {
		const start = day.getTime();
		// Calendar arithmetic rather than adding 24 h: a DST day is 23 or 25 h long
		day.setDate(day.getDate() + 1);
		const end = Math.min(day.getTime(), axis.end);
		bands.push({ start, end, firstStep: firstStepFrom(axis, start) });
	}
	return bands;
};

/**
 * The step length of a run: the gap between its first two valid times, an
 * hour when it exposes a single one.
 */
export const stepOf = (validTimes: Date[]): number =>
	validTimes.length < 2 ? MILLISECONDS_PER_HOUR : validTimes[1].getTime() - validTimes[0].getTime();

/**
 * Whether two axes draw the same picture: same span and density, and step
 * grids that coincide (anchors a whole number of steps apart). The timeline
 * jumps instantly between different axes, so equal ones must stay one object.
 */
export const sameGrid = (a: TimelineAxis, b: TimelineAxis): boolean =>
	a.start === b.start &&
	a.end === b.end &&
	a.stepMs === b.stepMs &&
	a.pxPerHour === b.pxPerHour &&
	Math.abs((a.anchor - b.anchor) % a.stepMs) === 0;

/** The valid time of the run (`steps`, ascending) nearest to `time`. */
export const nearestStep = (steps: number[], time: number): number => {
	let low = 0;
	let high = steps.length - 1;
	while (low < high) {
		const middle = (low + high) >> 1;
		if (steps[middle] < time) low = middle + 1;
		else high = middle;
	}
	const before = steps[low - 1];
	return before !== undefined && time - before < steps[low] - time ? before : steps[low];
};

export interface TickSegment {
	from: number;
	to: number;
	stepMs: number;
}

/**
 * The valid times of a run grouped into stretches of equal spacing, so the
 * ticks for a run that is hourly for five days and 3-hourly after that are
 * two repeating gradients rather than one per step.
 */
export const tickSegments = (steps: number[]): TickSegment[] => {
	const segments: TickSegment[] = [];
	for (let i = 1; i < steps.length; i++) {
		const stepMs = steps[i] - steps[i - 1];
		const last = segments[segments.length - 1];
		if (last && last.stepMs === stepMs) last.to = steps[i];
		else segments.push({ from: steps[i - 1], to: steps[i], stepMs });
	}
	return segments;
};
