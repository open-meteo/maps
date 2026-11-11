<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	import { timeSelectorActions } from '#lib/stores/keyboard.js';
	import { latest, metaJson, modelRun, modelRunLocked, now, time } from '#lib/stores/time.js';
	import { selectedDomain } from '#lib/stores/variables.js';

	import ModelRunPicker from '#lib/components/time/model-run-picker.svelte';
	import PrefetchButton from '#lib/components/time/prefetch-button.svelte';
	import Timeline from '#lib/components/time/timeline.svelte';

	import { MILLISECONDS_PER_WEEK } from '#lib/constants.js';
	import { throttle } from '#lib/helpers.js';
	import { runHistory } from '#lib/model-runs.js';
	import { formatUTCOffset } from '#lib/time-format.js';
	import {
		jumpToNow,
		selectLatestModelRun,
		selectTime,
		stepDay,
		stepModelRun,
		stepTime,
		toggleModelRunLock,
		validTimes
	} from '#lib/time-navigation.js';

	import { type TimelineAxis, buildAxis, firstStepFrom, sameGrid, stepOf } from './timeline';

	// No run yet: the first metadata is still loading, nothing can be selected
	const disabled = $derived($modelRun === undefined);

	const validDates = $derived(validTimes($metaJson));
	const steps = $derived(validDates.map((step) => step.getTime()));
	// The timeline jumps instantly to a new axis object, so an axis that draws
	// the same grid (clock tick, run switch) keeps the previous object
	let lastAxis: TimelineAxis | undefined;
	const stableAxis = (axis: TimelineAxis): TimelineAxis => {
		if (!lastAxis || !sameGrid(lastAxis, axis)) lastAxis = axis;
		return lastAxis;
	};

	const runRange = $derived<[number, number] | undefined>(
		steps.length > 0 ? [steps[0], steps[steps.length - 1]] : undefined
	);

	// The axis spans every time some kept run serves: the week of runs before
	// the latest one, through the end of the newest run. Steps outside the
	// selected run switch to the run that has them when selected.
	const bounds = $derived.by(() => {
		if (!$latest || !runRange) return undefined;
		const latestRun = new Date($latest.reference_time);
		const history = runHistory(latestRun, $selectedDomain.model_interval);
		const oldestRun = history[history.length - 1].getTime();
		// Monthly (seasonal) runs stay around; anything else is gone after a week
		const kept =
			$selectedDomain.model_interval === 'monthly'
				? oldestRun
				: $now.getTime() - MILLISECONDS_PER_WEEK;
		const start = Math.min(runRange[0], Math.max(oldestRun, kept));
		const latestSteps = validTimes($latest);
		const end = Math.max(runRange[1], latestSteps[latestSteps.length - 1]?.getTime() ?? 0);
		const axis = stableAxis(
			buildAxis(new Date(start), new Date(end), stepOf(validDates), new Date(steps[0]))
		);
		return { axis, coverage: [firstStepFrom(axis, start), end] as [number, number] };
	});

	const utcOffset = $derived(`UTC${formatUTCOffset($now)}`);

	const throttled = {
		previousHour: throttle(() => stepTime(-1), 150),
		nextHour: throttle(() => stepTime(1), 150),
		previousDay: throttle(() => stepDay(-1), 150),
		nextDay: throttle(() => stepDay(1), 150),
		previousModel: throttle(() => stepModelRun(-1), 250),
		nextModel: throttle(() => stepModelRun(1), 250)
	};

	$effect(() => {
		timeSelectorActions.set({
			...throttled,
			jumpToCurrentTime: jumpToNow,
			toggleModelRunLock,
			setLatestModelRun: selectLatestModelRun,
			timeNavigationDisabled: disabled
		});
		return () => timeSelectorActions.set({});
	});
</script>

<div
	class="time-selector-container fixed inset-x-2 bottom-2 z-40 md:inset-x-auto md:bottom-5 md:left-1/2 md:w-[min(78vw,1100px)] md:-translate-x-1/2 {disabled
		? 'cursor-not-allowed'
		: ''}"
>
	<div
		class="relative rounded-2xl bg-glass/80 shadow-xl ring-1 ring-foreground/10 backdrop-blur-md transition-opacity duration-300 select-none {disabled
			? 'opacity-75'
			: ''}"
	>
		<div class="flex h-11 items-stretch md:h-14">
			<button
				class="flex w-8 shrink-0 cursor-pointer items-center justify-center rounded-l-2xl text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed md:w-9"
				onclick={throttled.previousHour}
				{disabled}
				aria-label="Previous time step"
			>
				<ChevronLeftIcon size={18} />
			</button>

			<Timeline
				axis={bounds?.axis}
				value={$time}
				{steps}
				coverage={bounds?.coverage}
				now={$now}
				{disabled}
				locked={$modelRunLocked}
				onselect={selectTime}
			/>

			<button
				class="flex w-8 shrink-0 cursor-pointer items-center justify-center text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed max-md:rounded-r-2xl md:w-9"
				onclick={throttled.nextHour}
				{disabled}
				aria-label="Next time step"
			>
				<ChevronRightIcon size={18} />
			</button>

			<!-- Run controls: beside the track on wide screens -->
			<div
				class="hidden shrink-0 flex-col justify-center gap-1 border-l border-foreground/10 pr-3 pl-2.5 md:flex"
			>
				<ModelRunPicker />
				<div class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
					<PrefetchButton />
					<span class="tabular-nums">{utcOffset}</span>
				</div>
			</div>
		</div>

		<!-- Run controls: below the track on narrow screens -->
		<div class="flex h-6 items-center justify-between border-t border-foreground/10 px-2 md:hidden">
			<ModelRunPicker />
			<div class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
				<PrefetchButton />
				<span class="tabular-nums">{utcOffset}</span>
			</div>
		</div>
	</div>
</div>
