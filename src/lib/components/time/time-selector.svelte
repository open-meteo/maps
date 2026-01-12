<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { cubicInOut, sineInOut } from 'svelte/easing';
	import { preventDefault } from 'svelte/legacy';
	import { SvelteDate } from 'svelte/reactivity';
	import { fade, slide } from 'svelte/transition';

	import { domainStep, pad } from '@openmeteo/mapbox-layer';
	import { mode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';

	import { browser } from '$app/environment';

	import { loading, modelRun, preferences, time } from '$lib/stores/preferences';
	import { metaJson } from '$lib/stores/preferences';
	import {
		domainSelectionOpen,
		selectedDomain,
		variableSelectionOpen
	} from '$lib/stores/variables';

	import { changeOMfileURL, fmtISOWithoutTimezone, throttle, updateUrl } from '$lib';

	import Button from '../ui/button/button.svelte';

	import type { ModelDt } from '@openmeteo/mapbox-layer';

	let disabled = $derived($loading);
	let currentDate = $derived($time);

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

	const firstMetaTime = $derived(new Date($metaJson?.valid_times[0] as string));
	const lastMetaTime = $derived(
		new Date($metaJson?.valid_times[$metaJson?.valid_times.length - 1] as string)
	);

	const millisecondsPerDay = 24 * 60 * 60 * 1000;
	const daysBetween = (startDate: Date, endDate: Date) => {
		return (endDate.getTime() - startDate.getTime()) / millisecondsPerDay;
	};

	const amountOfDays = $derived(daysBetween(firstMetaTime, lastMetaTime));

	// const timeStepsLength = $derived($metaJson?.valid_times.length);

	const timeSteps = $derived.by(() =>
		$metaJson?.valid_times.map((validTime: string) => new Date(validTime))
	);

	const daySteps = $derived.by(() => {
		const days = [];
		for (let day of Array.from({ length: 1 + amountOfDays }, (_, i) => i)) {
			const date = new SvelteDate(firstMetaTime);
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
	let hoveredHour = $derived(
		timeSteps ? timeSteps[Math.floor(timeSteps.length * percentage)] : new Date()
	);
	let currentTimeStep = $derived(
		timeSteps ? timeSteps.find((tS: Date) => tS.getTime() === $time.getTime()) : new Date()
	);
	let currentPercentage = $derived(
		currentTimeStep && timeSteps ? timeSteps.indexOf(currentTimeStep) / (timeSteps.length - 1) : 0
	);

	onMount(() => {
		if (hoursHoverContainer) {
			hoursHoverContainer.addEventListener('mousemove', (e) => {
				if (hoursHoverContainerWidth) percentage = e.layerX / hoursHoverContainerWidth;
			});
			hoursHoverContainer.addEventListener('mouseout', () => {
				percentage = 0;
			});
			hoursHoverContainer.addEventListener('click', () => {
				if (timeSteps) onDateChange(timeSteps[Math.floor(timeSteps.length * percentage)]);
			});
		}
	});

	let modelRunLocked = $state(false);
	let modelRunSelectionOpen = $state(false);

	let modelInterval = $derived.by(() => {
		let mI = $selectedDomain.model_interval;

		switch (mI) {
			case 'hourly':
				return 1;
			case '3_hourly':
				return 3;
			case '6_hourly':
				return 6;
			case '12_hourly':
				return 12;
			case 'daily':
				return 24;
		}
		return 1;
	});

	let previousModelSteps = $derived.by(() => {
		const previousModels = [];
		for (let day of Array.from({ length: Math.floor((6.9 * 24) / modelInterval) }, (_, i) => i)) {
			// 7 Days
			const date = new SvelteDate(firstMetaTime);
			date.setUTCMinutes(0);
			date.setUTCSeconds(0);
			date.setUTCMilliseconds(0);
			date.setUTCHours(date.getUTCHours() - day * modelInterval);
			previousModels.push(date);
		}
		return previousModels;
	});
</script>

<div
	class="absolute bottom-0 min-w-full md:min-w-[unset] md:max-w-[75vw] -translate-x-1/2 left-1/2"
>
	<div
		class="relative duration-500 {disabled ? 'text-foreground/50' : ''} {$preferences.timeSelector
			? 'opacity-100 bottom-0'
			: 'pointer-events-none opacity-0 bottom-[-90px]'}"
	>
		<div
			bind:this={hoursHoverContainer}
			class="absolute bottom-[25px] w-full h-[25px] z-10 cursor-pointer"
		>
			{#if percentage}
				<div
					transition:fade={{ duration: 200 }}
					style="left: calc({percentage * 100}% - 33px); background-color: {dark
						? 'rgba(15, 15, 15, 0.95)'
						: 'rgba(240, 240, 240, 0.95)'}"
					class="absolute -top-[38px] p-1 w-[66px] text-center rounded"
				>
					<div class="relative">
						{pad(hoveredHour.getUTCHours())}:{pad(hoveredHour.getUTCMinutes())}
						<div
							style="background-color: {dark
								? 'rgba(15, 15, 15, 0.95)'
								: 'rgba(240, 240, 240, 0.95)'}"
							class="-z-10 absolute -bottom-2 w-3 h-3 bg-white rotate-45 -translate-x-1/2 left-1/2"
						></div>
					</div>
				</div>
			{/if}
		</div>
		<button
			onclick={() => (modelRunSelectionOpen = !modelRunSelectionOpen)}
			style="background-color: {dark ? 'rgba(15, 15, 15, 0.95)' : 'rgba(240, 240, 240, 0.95)'}"
			class="{modelRunSelectionOpen
				? '-top-11'
				: '-top-5'} cursor-pointer right-0 duration-500 absolute flex rounded-t-xl items-center px-2 gap-1"
		>
			{#if modelRunSelectionOpen && modelRun}
				<div class="duration-500 {modelRunSelectionOpen ? 'text-lg px-1 py-2' : 'text-sm'}">
					<small>{pad($modelRun.getUTCDate())}-{pad($modelRun.getUTCMonth() + 1)}</small>
					{pad($modelRun.getUTCHours())}:{pad($modelRun.getUTCMinutes())}
				</div>
			{/if}
			<div
				onclick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					modelRunLocked = !modelRunLocked;
				}}
				aria-label="Model Run Lock"
			>
				{#if modelRunLocked}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="text-red-800 lucide lucide-lock-icon lucide-lock"
						><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path
							d="M7 11V7a5 5 0 0 1 10 0v4"
						/></svg
					>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="text-green-800 lucide lucide-lock-open-icon lucide-lock-open"
						><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path
							d="M7 11V7a5 5 0 0 1 9.9-1"
						/></svg
					>
				{/if}
			</div>

			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="lucide lucide-chevron-up-icon lucide-chevron-up duration-500 {modelRunSelectionOpen
					? 'rotate-180'
					: ''}"><path d="m18 15-6-6-6 6" /></svg
			>
		</button>
		{#if modelRunSelectionOpen}
			<div
				transition:slide={{ duration: 500 }}
				style="background-color: {dark
					? 'rgba(15, 15, 15, 0.8)'
					: 'rgba(240, 240, 240, 0.85)'}; backdrop-filter: blur(4px); transition-duration: 500ms;"
				class="h-[40px] border-t relative px-4 gap-1 flex-row-reverse overflow-x-scroll items-center rounded-t-r-2xl flex"
			>
				{#each previousModelSteps as previousModelStep, i (i)}
					<button
						onclick={() => {
							$modelRun = previousModelStep;
							onDateChange(previousModelStep);
						}}
						class="px-1.5 py-0.5 border-2 flex items-center rounded gap-1 hover:bg-accent cursor-pointer {previousModelStep.getTime() ===
						firstMetaTime.getTime()
							? 'border-green-600'
							: ''} {previousModelStep.getTime() === $modelRun.getTime()
							? ''
							: 'border-transparent'}"
						><small
							>{pad(previousModelStep.getUTCDate())}-{pad(
								previousModelStep.getUTCMonth() + 1
							)}</small
						>
						{pad(previousModelStep.getUTCHours())}:{pad(previousModelStep.getUTCMinutes())}</button
					>
				{/each}
			</div>
		{/if}
		<div
			style="background-color: {dark
				? 'rgba(15, 15, 15, 0.8)'
				: 'rgba(240, 240, 240, 0.85)'}; backdrop-filter: blur(4px); transition-duration: 500ms;"
			class="time-selector {modelRunSelectionOpen
				? 'border-t'
				: ''} relative h-[50px] px-4 overflow-x-scroll rounded-t-r-2xl py-4"
		>
			<div class="absolute top-0 w-full h-[20px] z-10 cursor-pointer">
				<!-- {#if percentage}
					<div
						transition:fade={{ duration: 200 }}
						style="left: calc({percentage * 100}% - 33px); background-color: {dark
							? 'rgba(15, 15, 15, 0.95)'
							: 'rgba(240, 240, 240, 0.95)'}"
						class="absolute -top-[40px] p-1 w-[66px] text-center rounded"
					>
						{pad(hoveredHour.getUTCHours())}:{pad(hoveredHour.getUTCMinutes())}
					</div>
				{/if} -->
				{#if currentPercentage}
					<div
						style="left: {currentPercentage * 100}%;"
						class="absolute border-red-800 dark:border-red-500 border border-r-2 top-0 h-3"
					></div>
				{/if}
			</div>

			<div class="flex gap-2">
				{#each daySteps as dayStep, i (i)}
					<div class="relative flex gap-1 min-w-[150px]">
						<div
							class="absolute flex -bottom-2 -translate-x-1/2 left-1/2 items-center justify-center text-center flex-col"
						>
							<div class="">{dayNames[dayStep.getDay()]}</div>
							<small class="-mt-1.5"
								>{pad(dayStep.getUTCDate())}-{pad(dayStep.getUTCMonth() + 1)}</small
							>
						</div>
						{#each timeSteps as timeStep, i (i)}
							{#if timeStep.getTime() >= dayStep.getTime() && timeStep.getTime() < dayStep.getTime() + millisecondsPerDay}
								<!-- <Button
									class="p-0 m-0 border-none !h-[unset] hover:bg-transparent bg-transparent text-foreground cursor-pointer {timeStep.getTime() ===
									$time.getTime()
										? 'font-bold'
										: ''}"
									onclick={() => {
										let newDate = new SvelteDate(timeStep);
										onDateChange(newDate);
										centerDateButton(newDate.getUTCHours(), true);
									}}>{pad(timeStep.getUTCHours())}</Button
								> -->
							{/if}
						{/each}
					</div>
					{#if i !== daySteps.length - 1}
						|
					{/if}
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
