<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';

	import { DAY_NAMES, MILLISECONDS_PER_HOUR } from '#lib/constants.js';
	import { throttle } from '#lib/helpers.js';
	import { formatLocalDate, formatLocalTime, withLocalTime } from '#lib/time-format.js';

	import {
		type TimelineAxis,
		axisWidth,
		dayBands,
		firstStepFrom,
		nearestStep,
		snapToStep,
		tickSegments,
		timeToX,
		xToTime
	} from './timeline';

	interface Props {
		/** Undefined while the run's metadata loads: a skeleton is drawn instead. */
		axis: TimelineAxis | undefined;
		value: Date;
		/** The valid times of the selected run, ascending. */
		steps: number[];
		/** Earliest and latest instant any kept run serves. */
		coverage: [number, number] | undefined;
		now: Date;
		disabled: boolean;
		locked: boolean;
		onselect: (date: Date) => void;
	}

	let { axis, value, steps, coverage, now, disabled, locked, onselect }: Props = $props();

	let track: HTMLDivElement | undefined = $state();
	let trackWidth = $state(0);
	/** Pointer x within the track while hovering, undefined otherwise. */
	let hoverX: number | undefined = $state();
	/** The step under the centre cursor during a scroll, before it is committed. */
	let preview: number | undefined = $state();
	let dragging = $state(false);

	// A programmatic scroll (new value, snap-back) fires the same scroll events
	// as the user does; while it runs they neither preview nor commit anything.
	let settling = false;
	let settleAttempts = 0;
	let scrollEndTimer: ReturnType<typeof setTimeout> | undefined;
	let dragStartX = 0;
	let dragStartScroll = 0;
	let dragMoved = false;

	const bands = $derived(axis ? dayBands(axis) : []);
	const width = $derived(axis ? axisWidth(axis) : 0);
	const runRange = $derived<[number, number] | undefined>(
		steps.length > 0 ? [steps[0], steps[steps.length - 1]] : undefined
	);
	const segments = $derived(tickSegments(steps));

	// Inside the run the selection lands on its valid times, which thin out
	// towards the end of a forecast; elsewhere on the step grid, which is all
	// that is known of the neighbouring runs until one is loaded.
	const snap = (time: number): number => {
		if (!axis) return 0;
		const onGrid = snapToStep(axis, time);
		return inRun(onGrid) ? nearestStep(steps, time) : onGrid;
	};
	const centreTime = (scrollLeft: number) => (axis ? snap(xToTime(axis, scrollLeft)) : 0);

	const hoverTime = $derived(
		axis && hoverX !== undefined && track
			? snap(xToTime(axis, track.scrollLeft + hoverX - trackWidth / 2))
			: undefined
	);
	const shown = $derived(preview ?? value.getTime());
	const shownDate = $derived(new Date(shown));
	const hoverDate = $derived(hoverTime !== undefined ? new Date(hoverTime) : undefined);
	// The hover chip hides when it would sit on the centre chip
	const hoverChipVisible = $derived(
		hoverDate !== undefined &&
			!dragging &&
			hoverX !== undefined &&
			Math.abs(hoverX - trackWidth / 2) > 44
	);

	const sameDay = (a: Date, b: Date) =>
		a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
	const dayLabel = (date: Date) =>
		`${DAY_NAMES[date.getDay()].slice(0, 3)} ${formatLocalDate(date)}`;

	const inCoverage = (time: number) => !coverage || (time >= coverage[0] && time <= coverage[1]);
	const inRun = (time: number) => !!runRange && time >= runRange[0] && time <= runRange[1];
	const selectable = (time: number) => (locked ? inRun(time) : inCoverage(time));

	const atRest = (left: number) => !!track && Math.abs(track.scrollLeft - left) < 1;

	const scrollTo = (time: number, smooth: boolean) => {
		if (!track || !axis) return;
		const left = timeToX(axis, time);
		if (atRest(left)) return;
		settling = true;
		track.scrollTo({ left, behavior: smooth ? 'smooth' : 'instant' });
		armScrollEnd();
	};

	// Follow the value: the URL, the keyboard and run changes all land here.
	// Not while the user scrolls (preview set): the committed time may snap to
	// another step than the centre shows, and must not tug the track back
	// mid-gesture; a new axis then only gets its coordinates compensated so the
	// centre stays under the pointer. Otherwise a new axis is jumped to instantly.
	let shownAxis: TimelineAxis | undefined;
	$effect(() => {
		if (!track || !axis) return;
		const newAxis = shownAxis !== axis;
		shownAxis = axis;
		if (preview !== undefined) {
			if (newAxis) track.scrollLeft = timeToX(axis, preview);
			return;
		}
		if (dragging) return;
		const time = value.getTime();
		if (centreTime(track.scrollLeft) !== time) {
			settleAttempts = 0;
			scrollTo(time, !newAxis);
		}
	});

	const commit = (time: number) => {
		if (disabled || time === value.getTime() || !selectable(time)) return;
		onselect(new Date(time));
	};
	const commitThrottled = throttle(commit, 120);

	const onScrollEnd = () => {
		if (!track || !axis) return;
		if (settling) {
			// A programmatic scroll has to end on the value; one that was cut
			// short (or whose value moved on meanwhile) is sent there again
			settling = false;
			const target = value.getTime();
			if (atRest(timeToX(axis, target)) || settleAttempts++ >= 3) settleAttempts = 0;
			else scrollTo(target, true);
			return;
		}
		// The end of a gesture; the scrollend event and its timer fallback both
		// arrive here, the second one finds nothing left to do
		if (preview === undefined) return;
		const time = centreTime(track.scrollLeft);
		preview = undefined;
		// Only selectable steps can be committed: scrolling past the data
		// comes to rest on the last step that has some
		const target = selectable(time) ? time : nearestSelectable(time);
		commit(target);
		settleAttempts = 0;
		scrollTo(target, true);
	};

	const nearestSelectable = (time: number): number => {
		const range = locked ? runRange : coverage;
		if (!range) return time;
		return Math.min(Math.max(time, range[0]), range[1]);
	};

	// Safari has no scrollend: a pause in scroll events means the same
	const armScrollEnd = () => {
		clearTimeout(scrollEndTimer);
		scrollEndTimer = setTimeout(onScrollEnd, 160);
	};

	const onScroll = () => {
		if (!track || !axis) return;
		armScrollEnd();
		if (settling) return;
		const time = centreTime(track.scrollLeft);
		preview = time;
		commitThrottled(time);
	};

	const onPointerDown = (e: PointerEvent) => {
		// Touch pans natively; this is the mouse's way to drag the track
		if (e.pointerType === 'touch' || e.button !== 0 || !track || disabled) return;
		// The user takes over from any scroll still settling
		settling = false;
		dragging = true;
		dragMoved = false;
		dragStartX = e.clientX;
		dragStartScroll = track.scrollLeft;
		track.setPointerCapture(e.pointerId);
	};

	const onPointerMove = (e: PointerEvent) => {
		if (!track) return;
		const rect = track.getBoundingClientRect();
		hoverX = e.clientX - rect.left;
		if (!dragging) return;
		const delta = e.clientX - dragStartX;
		if (Math.abs(delta) > 3) dragMoved = true;
		track.scrollLeft = dragStartScroll - delta;
	};

	const onPointerUp = (e: PointerEvent) => {
		if (!dragging || !track || !axis) return;
		dragging = false;
		track.releasePointerCapture(e.pointerId);
		if (dragMoved) {
			armScrollEnd();
			return;
		}
		// A click jumps to the step under the pointer
		const rect = track.getBoundingClientRect();
		const time = snap(xToTime(axis, track.scrollLeft + e.clientX - rect.left - trackWidth / 2));
		if (!selectable(time)) return;
		commit(time);
		settleAttempts = 0;
		scrollTo(time, true);
	};

	const onPointerLeave = () => {
		hoverX = undefined;
	};

	// Mouse wheels mostly scroll vertically; the timeline only has one axis
	const onWheel = (e: WheelEvent) => {
		if (!track || e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
		e.preventDefault();
		settling = false;
		track.scrollLeft += e.deltaY;
	};

	onMount(() => {
		// Not a Svelte event attribute yet; Safari never fires it (see armScrollEnd)
		track?.addEventListener('scrollend', onScrollEnd);
		return () => {
			track?.removeEventListener('scrollend', onScrollEnd);
			clearTimeout(scrollEndTimer);
		};
	});
</script>

<div class="relative h-full min-w-0 flex-1">
	<!-- Selected time, centred on the cursor -->
	{#if axis}
		<div
			class="pointer-events-none absolute -top-3 left-1/2 z-30 flex -translate-x-1/2 items-baseline gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-primary-foreground shadow-md transition-opacity duration-200"
			class:opacity-70={preview !== undefined && preview !== value.getTime()}
		>
			<span class="text-[10px] leading-none opacity-80">{dayLabel(shownDate)}</span>
			<span class="text-sm leading-none font-semibold tabular-nums"
				>{formatLocalTime(shownDate)}</span
			>
		</div>

		<!-- Hovered time -->
		{#if hoverChipVisible && hoverDate && hoverX !== undefined}
			<div
				transition:fade={{ duration: 120 }}
				style="left: {hoverX}px;"
				class="pointer-events-none absolute -top-3 z-20 flex -translate-x-1/2 items-baseline gap-1.5 rounded-full bg-glass/90 px-2 py-0.5 shadow-sm ring-1 ring-foreground/10 backdrop-blur-sm {selectable(
					hoverTime ?? 0
				)
					? ''
					: 'text-foreground/40'}"
			>
				{#if !sameDay(hoverDate, shownDate)}
					<span class="text-[10px] leading-none text-foreground/60">{dayLabel(hoverDate)}</span>
				{/if}
				<span class="text-xs leading-none font-medium tabular-nums"
					>{formatLocalTime(hoverDate)}</span
				>
			</div>
		{/if}
	{/if}

	<!-- Cursor -->
	<div
		class="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-px -translate-x-1/2 bg-primary"
	></div>
	{#if hoverX !== undefined && !dragging && axis}
		<div
			style="left: {hoverX}px;"
			class="pointer-events-none absolute inset-y-1 z-10 w-px bg-foreground/30"
		></div>
	{/if}

	<!-- Scrolling track; the centre of the viewport is the selection -->
	<div
		bind:this={track}
		bind:clientWidth={trackWidth}
		role="slider"
		aria-label="Time"
		aria-valuetext={formatLocalTime(shownDate)}
		aria-valuenow={shown}
		aria-valuemin={axis?.start}
		aria-valuemax={axis?.end}
		tabindex="-1"
		class="timeline-track h-full overflow-x-auto overflow-y-hidden {dragging
			? 'cursor-grabbing'
			: 'cursor-pointer'} {disabled ? 'pointer-events-none' : ''}"
		onscroll={onScroll}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		onpointerleave={onPointerLeave}
		onwheel={onWheel}
	>
		<div
			class="relative flex h-full"
			style="padding-inline: {axis ? '50%' : '0'}; width: max-content;"
		>
			{#if axis}
				<div class="relative h-full text-foreground" style="width: {width}px;">
					<!-- Day bands with their labels and hour marks -->
					{#each bands as band, i (band.start)}
						{@const left = timeToX(axis, band.start)}
						{@const bandWidth = timeToX(axis, band.end) - left}
						<div
							class="absolute inset-y-0 border-l border-foreground/15 {i % 2 === 0
								? ''
								: 'bg-foreground/[0.035]'}"
							style="left: {left}px; width: {bandWidth}px;"
						>
							<div
								class="sticky left-0 inline-block max-w-full truncate px-1.5 pt-0.5 text-[10px] leading-4 whitespace-nowrap {inCoverage(
									band.end - 1
								) || inCoverage(band.start)
									? 'text-foreground/80'
									: 'text-foreground/35'}"
							>
								{dayLabel(new Date(band.start))}
							</div>
							{#each [6, 12, 18] as hour (hour)}
								{@const at = withLocalTime(new Date(band.start), hour).getTime()}
								{#if at < band.end}
									<span
										class="absolute bottom-0 -translate-x-1/2 text-[8px] leading-none text-foreground/45 tabular-nums"
										style="left: {timeToX(axis, at) - left}px;">{hour}</span
									>
								{/if}
							{/each}
						</div>
					{/each}

					<!-- Step ticks: faint for the steps other runs serve, solid for the selected run -->
					{#if coverage}
						{@const from = Math.max(coverage[0], axis.start)}
						{@const to = Math.min(coverage[1], axis.end)}
						{#if to > from}
							<div
								class="timeline-ticks absolute bottom-2.5 h-2 text-foreground/30"
								style="left: {timeToX(axis, from)}px; width: {timeToX(axis, to) -
									timeToX(axis, from)}px; --step: {(axis.stepMs / MILLISECONDS_PER_HOUR) *
									axis.pxPerHour}px; --offset: {timeToX(axis, firstStepFrom(axis, from)) -
									timeToX(axis, from)}px;"
							></div>
						{/if}
					{/if}
					{#each segments as segment (segment.from)}
						<div
							class="timeline-ticks absolute bottom-2.5 h-2.5 text-foreground/80 transition-opacity duration-300"
							class:opacity-50={disabled}
							style="left: {timeToX(axis, segment.from)}px; width: {timeToX(axis, segment.to) -
								timeToX(axis, segment.from) +
								1}px; --step: {(segment.stepMs / MILLISECONDS_PER_HOUR) *
								axis.pxPerHour}px; --offset: 0px;"
						></div>
					{/each}

					<!-- Now -->
					{#if now.getTime() >= axis.start && now.getTime() <= axis.end}
						<div
							class="absolute bottom-0 h-5 w-px bg-orange-500"
							style="left: {timeToX(axis, now.getTime())}px;"
						></div>
					{/if}
				</div>
			{:else}
				<!-- Loading skeleton -->
				<div class="flex h-full animate-pulse">
					{#each Array(5) as _, i (i)}
						<div class="relative w-48 border-l border-foreground/10">
							<div class="mt-1 ml-1.5 h-2.5 w-14 rounded bg-foreground/10"></div>
							<div class="absolute inset-x-0 bottom-2.5 h-2 bg-foreground/6"></div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.timeline-track {
		scrollbar-width: none;
		touch-action: pan-x;
	}
	.timeline-track::-webkit-scrollbar {
		display: none;
	}
	/* One line per step, aligned to the step grid */
	.timeline-ticks {
		background-image: repeating-linear-gradient(
			to right,
			currentColor 0 1px,
			transparent 1px var(--step)
		);
		background-position-x: var(--offset);
	}
</style>
