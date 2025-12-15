<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { SvelteDate } from 'svelte/reactivity';
	import { get } from 'svelte/store';

	import { domainStep, pad } from '@openmeteo/mapbox-layer';
	import { mode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';

	import { browser } from '$app/environment';

	import { loading, preferences, time } from '$lib/stores/preferences';
	import {
		domainSelectionOpen as dSO,
		selectedDomain,
		variableSelectionOpen as vSO
	} from '$lib/stores/variables';

	import { changeOMfileURL, fmtISOWithoutTimezone, updateUrl } from '$lib';

	import type { ModelDt } from '@openmeteo/mapbox-layer';

	let disabled = $derived($loading);
	let currentDate = $derived($time);

	const resolution: ModelDt = $derived($selectedDomain.time_interval);

	const previousHour = () => {
		const date = domainStep($time, resolution, 'backward');
		onDateChange(date);
		centerDateButton(date.getHours(), true);
	};

	const nextHour = () => {
		const date = domainStep($time, resolution, 'forward');
		onDateChange(date);
		centerDateButton(date.getHours(), true);
	};

	const previousDay = () => {
		$time.setHours($time.getHours() - 23);
		const date = domainStep($time, resolution, 'backward');
		onDateChange(date);
		centerDateButton(date.getHours(), true);
	};

	const nextDay = () => {
		$time.setHours($time.getHours() + 23);
		const date = domainStep($time, resolution, 'forward');
		onDateChange(date);
		centerDateButton(date.getHours(), true);
	};

	let domainSelectionOpen = $state(get(dSO));
	dSO.subscribe((dO) => {
		domainSelectionOpen = dO;
	});

	let variableSelectionOpen = $state(get(vSO));
	vSO.subscribe((vO) => {
		variableSelectionOpen = vO;
	});

	const onDateChange = (date: Date) => {
		$time = new SvelteDate(date);
		updateUrl('time', fmtISOWithoutTimezone($time));
		changeOMfileURL();
	};

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

	const dark = $derived(mode.current === 'dark');

	const timeInterval = $derived.by(() => {
		const timeIntervalString = $selectedDomain.time_interval as ModelDt;
		if (timeIntervalString === '15_minute') {
			return 0.25;
		} else if (timeIntervalString === 'hourly') {
			return 1;
		} else if (timeIntervalString === '3_hourly') {
			return 3;
		} else if (timeIntervalString === '6_hourly') {
			return 6;
		} else if (timeIntervalString === '12_hourly') {
			return 12;
		} else if (timeIntervalString === 'daily') {
			return 24;
		} else {
			return undefined;
		}
	});

	const timeSteps = $derived.by(() => {
		if (timeInterval) {
			return [...Array(24 / timeInterval)].map((i, index) => {
				const date = new SvelteDate(currentDate);
				date.setHours(index * timeInterval);
				return date;
			});
		} else {
			return undefined;
		}
	});

	let hoursContainer: HTMLElement | undefined = $state();
	let hoursContainerParent: HTMLElement | undefined = $state();

	let movingToNextHour = $state(false);
	let movingToNextHourTimeout: NodeJS.Timeout | undefined = $state(undefined);

	onMount(() => {
		if (hoursContainer && hoursContainerParent) {
			hoursContainer.scrollIntoView({
				behavior: 'instant',
				block: 'center',
				inline: 'center'
			});

			hoursContainerParent.addEventListener('scroll', (e) => {
				if (!movingToNextHour) {
					const target = e.currentTarget as Element;
					const width = target.getBoundingClientRect().width;
					const left = target.scrollLeft;

					const percentage = left / width;

					if (left === 0) {
						currentDate.setHours(0);
					}
					if (percentage) {
						console.log(percentage);
						currentDate.setHours(Math.floor(percentage * 25));
					}
				}
			});

			hoursContainerParent.addEventListener('scrollend', (e) => {
				if (!movingToNextHour) {
					onDateChange(currentDate);
				}
			});
		}
	});
	const centerDateButton = (hour: number, smooth = false) => {
		if (hoursContainer && hoursContainerParent) {
			if (smooth) {
				movingToNextHour = true;
				if (movingToNextHourTimeout) clearTimeout(movingToNextHourTimeout);
			}
			const target = hoursContainer;
			const width = target.getBoundingClientRect().width;
			const left = (width + 18) * (hour / 24);
			console.log(left, width);
			hoursContainerParent.scrollTo({ left: left, behavior: smooth ? 'smooth' : 'instant' });
			if (smooth)
				movingToNextHourTimeout = setTimeout(() => {
					movingToNextHour = false;
				}, 500);
		}
	};
</script>

<div
	style="background-color: {dark
		? 'rgba(15, 15, 15, 0.8)'
		: 'rgba(240, 240, 240, 0.85)'}; backdrop-filter: blur(4px); transition-duration: 500ms;"
	class="time-selector absolute h-[120px] w-full py-4 {$preferences.timeSelector
		? 'opacity-100 bottom-0'
		: 'pointer-events-none opacity-0 bottom-[-120px]'}"
>
	<div
		class="font-bold absolute -top-[40px] left-1/2 h-[40px] text-2xl pointer-events-none -translate-x-1/2"
	>
		<div
			style="background-color: {dark
				? 'rgba(15, 15, 15, 0.8)'
				: 'rgba(240, 240, 240, 0.85)'}; backdrop-filter: blur(4px); transition-duration: 500ms;"
			class="px-4 rounded-t-xl h-[40.5px] flex items-center justify-center min-w-[105px]"
		>
			{pad(currentDate.getHours()) + ':' + pad(currentDate.getMinutes())}
		</div>
	</div>
	<div class="flex flex-col {disabled ? 'cursor-not-allowed' : ''}">
		<div class="flex items-center justify-center gap-0.5">
			<!-- <button
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
						? 'UTC+'
						: 'UTC-'}{-currentDate.getTimezoneOffset() / 60}:00)
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
			> -->
			|
		</div>
		<div
			style="box-shadow: inset -50w 0 10px -50w red, inset 50w 0 10px -50vw red;"
			bind:this={hoursContainerParent}
			class="relative overflow-x-scroll mt-2 w-[100vw]"
		>
			<!-- <div
				style="background: {dark
					? 'linear-gradient(to right, rgba(15, 15, 15, 0.8), rgba(15, 15, 15, 0.8), transparent, rgba(15, 15, 15, 0.8), rgba(15, 15, 15, 0.8));'
					: 'linear-gradient(to right, rgba(240, 240, 240, 1), rgba(240, 240, 240, 1), transparent, rgba(240, 240, 240, 1), rgba(240, 240, 240, 1));'}"
				class="h-8 fixed w-full left-0 pointer-events-none"
			></div> -->
			<div class="flex cursor-grab flex-row w-[calc(200vw-64px)] pb-2">
				<div class="w-[calc(50vw-16px)]"></div>
				<div
					bind:this={hoursContainer}
					class="w-[calc(100vw-32px)] flex flex-row items-center justify-between"
				>
					{#each timeSteps as step (step)}
						<button
							class="bg-blue-500 p-1 text-white min-w-12 flex justify-center rounded cursor-pointer"
							onclick={() => {
								let newDate = new SvelteDate(time);
								newDate.setHours(step.getHours());
								onDateChange(newDate);
								centerDateButton(step.getHours(), true);
							}}
						>
							{pad(step.getHours())}
						</button>
					{/each}
				</div>

				<div class="w-[50vw-16px]"></div>
			</div>
		</div>
		<!-- <input
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
		/> -->
		<!-- <input
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
		/> -->
	</div>
</div>
