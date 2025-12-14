<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { SvelteDate } from 'svelte/reactivity';
	import { get } from 'svelte/store';

	import { domainStep } from '@openmeteo/mapbox-layer';
	import { toast } from 'svelte-sonner';

	import { browser } from '$app/environment';

	import { loading, preferences, time } from '$lib/stores/preferences';
	import {
		domainSelectionOpen as dSO,
		selectedDomain,
		variableSelectionOpen as vSO
	} from '$lib/stores/variables';

	import { changeOMfileURL, fmtISOWithoutTimezone, pad, updateUrl } from '$lib';

	import type { ModelDt } from '@openmeteo/mapbox-layer';

	const onDateChange = (date: Date) => {
		$time = new SvelteDate(date);
		updateUrl('time', fmtISOWithoutTimezone($time));
		changeOMfileURL();
	};

	let disabled = $derived($loading);
	let timeSelector = $derived($preferences.timeSelector);

	let currentDate = $derived($time);
	let currentHour = $derived(currentDate.getHours());

	const resolution: ModelDt = $derived($selectedDomain.time_interval);

	const previousHour = () => {
		const date = domainStep($time, resolution, 'backward');
		onDateChange(date);
	};

	const nextHour = () => {
		const date = domainStep($time, resolution, 'forward');
		onDateChange(date);
	};

	const previousDay = () => {
		$time.setHours($time.getHours() - 23);
		const date = domainStep($time, resolution, 'backward');
		onDateChange(date);
	};

	const nextDay = () => {
		$time.setHours($time.getHours() + 23);
		const date = domainStep($time, resolution, 'forward');
		onDateChange(date);
	};

	let domainSelectionOpen = $state(get(dSO));
	dSO.subscribe((dO) => {
		domainSelectionOpen = dO;
	});

	let variableSelectionOpen = $state(get(vSO));
	vSO.subscribe((vO) => {
		variableSelectionOpen = vO;
	});

	const keydownEvent = (event: KeyboardEvent) => {
		const canNavigate = !(domainSelectionOpen || variableSelectionOpen);
		if (!canNavigate) return;

		const actions: Record<string, () => void> = {
			ArrowLeft: previousHour,
			ArrowRight: nextHour,
			ArrowDown: previousDay,
			ArrowUp: nextDay
		};

		const action = actions[event.key];
		if (!action) return;

		if (!disabled) {
			action();
		} else {
			toast.warning('Still loading another OM file');
		}
	};

	onMount(() => {
		if (browser) {
			window.addEventListener('keydown', keydownEvent);
		}
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('keydown', keydownEvent);
		}
	});
</script>

<div
	style="box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 0px 2px;"
	class="time-selector bg-background/90 dark:bg-background/70 duration-300 bottom-14.5 transform-[translate(-50%)] absolute left-[50%] mx-auto rounded-[4px] px-3 py-3 {!timeSelector
		? 'pointer-events-none opacity-0'
		: 'opacity-100'}"
>
	<div class="flex flex-col {disabled ? 'cursor-not-allowed' : ''}">
		<div class="flex items-center justify-center gap-0.5">
			<button
				id="prev_hour"
				class="cursor-pointer rounded border bg-white p-1.5 delay-75 duration-200 dark:bg-[#646464cc] {disabled
					? 'border-foreground/50  text-black/50 dark:text-white/50 '
					: ' border-foreground/75 text-black  dark:text-white'}"
				type="button"
				aria-label="Previous hour"
				onclick={previousHour}
				><svg
					xmlns="http://www.w3.org/2000/svg"
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="lucide lucide-chevron-left-icon lucide-chevron-left"
					><path d="m15 18-6-6 6-6" /></svg
				></button
			>
			<div class=" flex flex-col items-center">
				<span
					class="min-w-[150px] whitespace-nowrap text-center delay-75 duration-200 {disabled
						? ' text-black/50 dark:text-white/50 '
						: ' text-black  dark:text-white'}"
					id="slider_time_label"
					>{`${currentDate.getFullYear()}-${pad(currentDate.getMonth() + 1)}-${pad(currentDate.getDate())}T${pad(currentDate.getHours())}:${pad(currentDate.getMinutes())}`}</span
				>
				<span
					class="text-xs delay-75 duration-200 {disabled
						? ' text-black/50 dark:text-white/50 '
						: ' text-black  dark:text-white'}"
				>
					{Intl.DateTimeFormat().resolvedOptions().timeZone} ({currentDate.getTimezoneOffset() < 0
						? '+'
						: '-'}{-currentDate.getTimezoneOffset() / 60}:00)
				</span>
			</div>

			<button
				id="next_hour"
				class="cursor-pointer rounded border bg-white p-1.5 delay-75 duration-200 dark:bg-[#646464cc] {disabled
					? 'border-foreground/50  text-black/50 dark:text-white/50 '
					: ' border-foreground/75 text-black  dark:text-white'}"
				type="button"
				aria-label="Next hour"
				onclick={nextHour}
				><svg
					xmlns="http://www.w3.org/2000/svg"
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="lucide lucide-chevron-right-icon lucide-chevron-right"
					><path d="m9 18 6-6-6-6" /></svg
				></button
			>
		</div>
		<input
			id="time_slider"
			class="w-full delay-75 duration-200"
			type="range"
			min="0"
			max="24"
			step={resolution}
			value={currentHour}
			{disabled}
			oninput={(e) => {
				const target = e.target as HTMLInputElement;
				const value = target?.value;
				let newDate = new SvelteDate(time);
				newDate.setHours(Number(value));
				currentDate = newDate;
			}}
			onchange={(e) => {
				const target = e.target as HTMLInputElement;
				const value = target?.value;
				const date = new SvelteDate(time);
				date.setHours(Number(value));
				onDateChange(date);
			}}
		/>
		<input
			type="date"
			id="date_picker"
			class="date-time-selection rounded bg-white text-sm delay-75 duration-200 dark:bg-[#646464cc] {disabled
				? 'border-foreground/50  text-black/50 dark:text-white/50 '
				: ' border-foreground/75 text-black  dark:text-white'}"
			{disabled}
			value={`${currentDate.getFullYear()}-${pad(currentDate.getMonth() + 1)}-${pad(currentDate.getDate())}`}
			oninput={(e) => {
				const target = e.target as HTMLInputElement;
				const value = target?.value;
				const date = new SvelteDate(value);
				date.setHours(currentHour);
				onDateChange(date);
			}}
		/>
	</div>
</div>
