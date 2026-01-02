<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { SvelteDate } from 'svelte/reactivity';
	import { fade } from 'svelte/transition';

	import { domainStep, pad } from '@openmeteo/mapbox-layer';
	import { mode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';

	import { browser } from '$app/environment';

	import { loading, preferences, time } from '$lib/stores/preferences';
	import { metaJson } from '$lib/stores/preferences';
	import {
		domainSelectionOpen,
		selectedDomain,
		variableSelectionOpen
	} from '$lib/stores/variables';

	import { changeOMfileURL, fmtISOWithoutTimezone, throttle, updateUrl } from '$lib';

	import type { ModelDt } from '@openmeteo/mapbox-layer';

	let disabled = $derived($loading);
	let currentDate = $derived($time);
	let dateTimePickerOpen = $state(false);

	const resolution: ModelDt = $derived($selectedDomain.time_interval);

	const previousHour = () => {
		const date = domainStep($time, resolution, 'backward');
		onDateChange(date);
		centerDateButton(date.getUTCHours(), true);
	};

	const nextHour = () => {
		const date = domainStep($time, resolution, 'forward');
		onDateChange(date);
		centerDateButton(date.getUTCHours(), true);
	};

	const previousDay = () => {
		$time.setUTCHours($time.getUTCHours() - 23);
		const date = domainStep($time, resolution, 'backward');
		onDateChange(date);
		centerDateButton(date.getUTCHours(), true);
	};

	const nextDay = () => {
		$time.setUTCHours($time.getUTCHours() + 23);
		const date = domainStep($time, resolution, 'forward');
		onDateChange(date);
		centerDateButton(date.getUTCHours(), true);
	};

	const onDateChange = (date: Date, callUpdateUrl = true) => {
		$time = new SvelteDate(date);
		if (callUpdateUrl) updateUrl('time', fmtISOWithoutTimezone($time));
		changeOMfileURL();
	};

	const keydownEvent = (event: KeyboardEvent) => {
		const canNavigate = !($domainSelectionOpen || $variableSelectionOpen);
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

	const firstTime = $derived(new Date($metaJson?.valid_times[0] as string));
	const lastTime = $derived(
		new Date($metaJson?.valid_times[$metaJson?.valid_times.length - 1] as string)
	);

	const millisecondsPerDay = 24 * 60 * 60 * 1000;
	const daysBetween = (startDate: Date, endDate: Date) => {
		return (endDate.getTime() - startDate.getTime()) / millisecondsPerDay;
	};

	const amountOfDays = $derived(daysBetween(firstTime, lastTime));

	const timeStepsLength = $derived($metaJson?.valid_times.length);

	const timeSteps = $derived.by(() =>
		$metaJson?.valid_times.map((validTime) => new Date(validTime))
	);

	const daySteps = $derived.by(() => {
		const days = [];
		for (let day of Array.from({ length: 1 + amountOfDays }, (_, i) => i)) {
			const date = new SvelteDate(firstTime);
			date.setUTCHours(0);
			date.setUTCMinutes(0);
			date.setUTCSeconds(0);
			date.setUTCMilliseconds(0);
			date.setDate(date.getDate() + day);
			days.push(date);
		}
		return days;
	});

	const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

	let hoursContainer: HTMLElement | undefined = $state();
	let hoursContainerParent: HTMLElement | undefined = $state();

	let movingToNextHour = $state(false);
	let movingToNextHourTimeout: ReturnType<typeof setTimeout> | undefined = $state(undefined);

	let timeInterval = 1; // FIX LATER

	const onScrollEvent = (e: Event) => {
		if (!movingToNextHour) {
			let changed = false;

			const target = e.target as Element;
			const width = target.getBoundingClientRect().width;
			const left = target.scrollLeft;
			const percentage = left / width;

			if (left === 0) {
				currentDate.setUTCHours(0);
				changed = true;
			}
			if (percentage && timeInterval) {
				const hour = Math.floor(percentage * (25 / timeInterval)) * timeInterval;
				if ($time.getUTCHours() !== hour) {
					currentDate.setUTCHours(hour);
					changed = true;
				}
			}
			if ($selectedDomain.value.startsWith('dwd_icon') && changed) {
				onDateChange(currentDate, false);
			}
		}
	};

	const onScrollEndEvent = () => {
		if (!isDown) {
			if (!movingToNextHour && !$selectedDomain.value.startsWith('dwd_icon')) {
				onDateChange(currentDate);
			}
			if ($selectedDomain.value.startsWith('dwd_icon')) {
				updateUrl('time', fmtISOWithoutTimezone($time));
			}
		}
	};

	let isDown = $state(false);
	let startX = $state(0);
	let startY = $state(0);
	let scrollLeft = $state(0);
	let scrollTop = $state(0);

	onMount(() => {
		if (hoursContainer && hoursContainerParent) {
			hoursContainer.scrollIntoView({
				behavior: 'instant',
				block: 'center',
				inline: 'center'
			});

			hoursContainerParent.addEventListener('scroll', throttle(onScrollEvent, 150));

			hoursContainerParent.addEventListener('scrollend', throttle(onScrollEndEvent, 150));

			hoursContainerParent.addEventListener('mousedown', (e) => {
				if (!hoursContainerParent) return;
				isDown = true;
				startX = e.pageX - hoursContainerParent.offsetLeft;
				startY = e.pageY - hoursContainerParent.offsetTop;
				scrollLeft = hoursContainerParent.scrollLeft;
				scrollTop = hoursContainerParent.scrollTop;
				if (hoursContainer) hoursContainer.style.cursor = 'grabbing';
			});

			// hoursContainerParent.addEventListener('mouseleave', () => {
			// 	isDown = false;
			// 	if (hoursContainer) hoursContainer.style.cursor = 'grab';
			// });

			hoursContainerParent.addEventListener('mouseup', () => {
				isDown = false;
				if (hoursContainer) hoursContainer.style.cursor = 'grab';
				onScrollEndEvent();
			});

			hoursContainerParent.addEventListener('mousemove', (e) => {
				if (!isDown || !hoursContainerParent) return;
				e.preventDefault();
				const x = e.pageX - hoursContainerParent.offsetLeft;
				const y = e.pageY - hoursContainerParent.offsetTop;
				const walkX = (x - startX) * 1; // Change this number to adjust the scroll speed
				const walkY = (y - startY) * 1; // Change this number to adjust the scroll speed
				hoursContainerParent.scrollLeft = scrollLeft - walkX;
				hoursContainerParent.scrollTop = scrollTop - walkY;
			});
		}
	});

	const centerDateButton = (hour: number, smooth = false) => {
		if (hoursContainer && hoursContainerParent) {
			if (smooth) {
				movingToNextHour = true;
				if (movingToNextHourTimeout) clearTimeout(movingToNextHourTimeout);
			}
			const width = hoursContainer.getBoundingClientRect().width;
			const left = 8 + width * (hour / 23.5);
			hoursContainerParent.scrollTo({ left: left, behavior: smooth ? 'smooth' : 'instant' });
			if (smooth)
				movingToNextHourTimeout = setTimeout(() => {
					movingToNextHour = false;
				}, 700);
		}
	};

	// for datefield
	// let dateString = $derived($time.toISOString().slice(0, 16));
	//
	let percentage = $state(0);
	let hoursHoverContainer: HTMLElement | undefined = $state();
	let hoursHoverContainerWidth = $derived(hoursHoverContainer?.getBoundingClientRect().width);
	let hoveredHour = $derived(timeSteps[Math.floor(timeSteps.length * percentage)]);

	onMount(() => {
		if (hoursHoverContainer) {
			hoursHoverContainer.addEventListener('mousemove', (e) => {
				percentage = e.layerX / hoursHoverContainerWidth;
			});
			hoursHoverContainer.addEventListener('mouseout', (e) => {
				percentage = 0;
			});
			hoursHoverContainer.addEventListener('click', () => {
				onDateChange(timeSteps[Math.floor(timeSteps.length * percentage)]);
			});
		}
	});
</script>

<div
	class="absolute bottom-0 min-w-full md:min-w-[unset] md:max-w-[75vw] -translate-x-1/2 left-1/2"
>
	<div
		class="relative duration-500 {$preferences.timeSelector
			? 'opacity-100 bottom-0'
			: 'pointer-events-none opacity-0 bottom-[-120px]'}"
	>
		<div
			style="background-color: {dark ? 'rgba(15, 15, 15, 0.8)' : 'rgba(240, 240, 240, 0.85)'};"
			class="tooltip absolute rounded-t-2xl bottom-[60px] px-4 py-1 -translate-x-1/2 left-1/2"
		>
			<div class="text-2xl font-bold">
				{pad(currentDate.getUTCHours()) + ':' + pad(currentDate.getMinutes())}
			</div>
		</div>
		<div bind:this={hoursHoverContainer} class="absolute w-full h-[20px] z-10 cursor-pointer">
			{#if percentage}
				<div
					transition:fade={{ duration: 200 }}
					style="left: calc({percentage * 100}% - 33px); background-color: {dark
						? 'rgba(15, 15, 15, 0.95)'
						: 'rgba(240, 240, 240, 0.95)'}"
					class="absolute -top-[40px] p-1 w-[66px] text-center rounded"
				>
					{pad(hoveredHour.getUTCHours())}:{pad(hoveredHour.getUTCMinutes())}
				</div>
			{/if}
		</div>
		<div
			style="background-color: {dark
				? 'rgba(15, 15, 15, 0.8)'
				: 'rgba(240, 240, 240, 0.85)'}; backdrop-filter: blur(4px); transition-duration: 500ms;"
			class="time-selector h-[60px] px-4 overflow-x-scroll rounded-t-2xl py-4"
		>
			<div class="flex gap-2">
				{#each daySteps as dayStep, i (i)}
					<div class="relative flex gap-1">
						<div class="absolute -bottom-5 -translate-x-1/2 left-1/2">
							{dayNames[dayStep.getDay()]}
							{pad(dayStep.getDate())}-{pad(dayStep.getMonth() + 1)}
						</div>
						{#each timeSteps as timeStep, i (i)}
							{#if timeStep.getTime() >= dayStep.getTime() && timeStep.getTime() < dayStep.getTime() + millisecondsPerDay}
								<button
									class="cursor-pointer {timeStep.getTime() === $time.getTime() ? 'font-bold' : ''}"
									onclick={() => {
										let newDate = new SvelteDate(timeStep);
										onDateChange(newDate);
										centerDateButton(newDate.getUTCHours(), true);
									}}>{pad(timeStep.getUTCHours())}</button
								>
							{/if}
						{/each}
					</div>
					|
				{/each}
			</div>
			<!-- <div class="font-bold absolute -top-[40px] left-1/2 h-[40px] text-2xl -translate-x-1/2">
			<div
				style="background-color: {dark
					? 'rgba(15, 15, 15, 0.8)'
					: 'rgba(240, 240, 240, 0.85)'}; backdrop-filter: blur(4px); transition-duration: 500ms;"
				class="px-4 rounded-t-xl h-[40.1px] flex items-center justify-center gap-2 min-w-[105px]"
			>
				<div class="datetime-picker">
					<button
						class="flex items center cursor-pointer"
						aria-label="Date Picker Button"
						onclick={() => (dateTimePickerOpen = !dateTimePickerOpen)}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="lucide lucide-calendar1-icon lucide-calendar-1"
							><path d="M11 14h1v4" /><path d="M16 2v4" /><path d="M3 10h18" /><path
								d="M8 2v4"
							/><rect x="3" y="4" width="18" height="18" rx="2" /></svg
						>
					</button>

					{#if dateTimePickerOpen}
						<div
							class="picker-overlay absolute -top-[65px] flex p-2 rounded -left-[65px]"
							style="background-color: {dark
								? 'rgba(15, 15, 15, 0.8)'
								: 'rgba(240, 240, 240, 0.85)'}; backdrop-filter: blur(4px); transition-duration: 500ms;"
						>
							<div class="picker-panel">
								<input
									type="datetime-local"
									bind:value={dateString}
									onchange={(e) => {
										const hour = $time.getUTCHours();
										const target = e.target as HTMLInputElement;
										const value = target?.value;
										const newDate = new SvelteDate(value);
										newDate.setUTCHours(hour);
										onDateChange(newDate);
										centerDateButton(newDate.getUTCHours(), true);
									}}
									class="native-picker"
								/>
							</div>
						</div>
					{/if}
				</div>
				<div>
					{pad(currentDate.getUTCHours()) + ':' + pad(currentDate.getMinutes())}
				</div>
			</div>
		</div> -->
			<!-- <div class="flex flex-col">
			<div
				style="box-shadow: inset -50w 0 10px -50w red, inset 50w 0 10px -50vw red;"
				bind:this={hoursContainerParent}
				class="relative overflow-x-scroll mt-2 w-[100vw]"
			>
				<div class="flex cursor-grab flex-row w-[calc(200vw-64px)] pb-2">
					<div class="w-[calc(50vw-16px)]"></div>
					<div
						bind:this={hoursContainer}
						class="w-[calc(100vw-32px)] flex flex-row items-center justify-between"
					>
						{#each timeSteps as step (step)}
							<button
								class="bg-blue-500 p-1 text-white min-w-12 flex justify-center rounded {isDown
									? 'cursor-grabbing'
									: 'cursor-pointer'}"
								onclick={() => {
									let newDate = new SvelteDate($time);
									newDate.setUTCHours(step.getUTCHours());
									onDateChange(newDate);
									centerDateButton(step.getUTCHours(), true);
								}}
							>
								{pad(step.getUTCHours())}
							</button>
						{/each}
					</div>

					<div class="w-[50vw-16px]"></div>
				</div>
			</div>
		</div> -->
		</div>
	</div>
</div>
