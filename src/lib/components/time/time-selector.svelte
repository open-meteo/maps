<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { MediaQuery, SvelteDate } from 'svelte/reactivity';
	import { fade, slide } from 'svelte/transition';

	import { closestModelRun } from '@openmeteo/mapbox-layer';
	import { mode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';

	import { browser } from '$app/environment';

	import { loading, modelRun, preferences, time } from '$lib/stores/preferences';
	import { inProgress, latest, metaJson } from '$lib/stores/preferences';
	import {
		domainSelectionOpen,
		selectedDomain,
		variableSelectionOpen
	} from '$lib/stores/variables';

	import {
		changeOMfileURL,
		fmtISOWithoutTimezone,
		getMetaData,
		pad,
		throttle,
		updateUrl
	} from '$lib';

	let now = new SvelteDate();
	let disabled = $derived($loading);
	let currentDate = new SvelteDate($time);
	const dark = $derived(mode.current === 'dark');

	let timeInterval = $derived.by(() => {
		let tI = $selectedDomain.time_interval;

		switch (tI) {
			case '15_minute':
				return 0.25;
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

	let dayWidth = $derived(timeInterval === 0.25 ? 340 : 170);

	const previousHour = () => {
		let date = new SvelteDate($time);
		if (timeSteps && currentIndex - 1 >= 0) {
			date = timeSteps[currentIndex - 1];

			onDateChange(date);
			// if (desktop.current && currentPercentage < 0.1) {
			// 	dayContainer?.scrollTo({
			// 		left: dayContainerScrollLeft - dayWidth / 25,
			// 		behavior: 'smooth'
			// 	});
			// } else {
			// 	centerDateButton(date);
			// }
		} else {
			if (currentIndex - 1 < 0) {
				let date = new SvelteDate($time);
				date.setUTCHours(date.getUTCHours() - 1);
				onDateChange(date);
			}
		}
	};

	const previousModel = () => {
		if (modelRunLocked) {
			toast.warning('Model run locked');
			return;
		}
		const currentIndex = previousModelSteps.findIndex((pMS) =>
			$modelRun ? $modelRun.getTime() === pMS.getTime() : false
		);
		if (currentIndex !== -1) {
			onModelRunChange(previousModelSteps[currentIndex + 1]);
		}
	};

	const nextHour = () => {
		let date = new SvelteDate($time);
		if (timeSteps && currentIndex + 1 <= timeSteps.length - 1) {
			date = timeSteps[currentIndex + 1];

			onDateChange(date);
			// if (desktop.current && currentPercentage > 0.82) {
			// 	dayContainer?.scrollTo({
			// 		left: dayContainerScrollLeft + dayWidth / 25,
			// 		behavior: 'smooth'
			// 	});
			// } else {
			// 	centerDateButton(date);
			// }
		} else {
			if (timeSteps && currentIndex + 1 > timeSteps.length - 1) {
				toast.warning('Already on latest timestep');
			}
		}
	};

	const nextModel = () => {
		if (modelRunLocked) {
			toast.warning('Model run locked');
			return;
		}
		const currentIndex = previousModelSteps.findIndex((pMS) =>
			$modelRun ? $modelRun.getTime() === pMS.getTime() : false
		);
		if (currentIndex !== -1) {
			if (currentIndex === 0) {
				toast.warning('Already on latest model');
			} else {
				onModelRunChange(previousModelSteps[currentIndex - 1]);
			}
		}
	};

	const previousDay = () => {
		let date = new SvelteDate($time);
		date.setUTCHours(date.getUTCHours() - 24);
		const timeStep = findTimeStep(date);
		if (timeStep) date = timeStep;
		onDateChange(date);
		// if (desktop.current && currentPercentage < 0.25) {
		// 	dayContainer?.scrollTo({ left: dayContainerScrollLeft - dayWidth, behavior: 'smooth' });
		// } else {
		// 	centerDateButton(date);
		// }
	};

	const nextDay = () => {
		let date = new SvelteDate($time);
		date.setUTCHours(date.getUTCHours() + 24);
		const timeStep = findTimeStep(date);
		if (timeStep) date = timeStep;
		onDateChange(date);
		// if (desktop.current && currentPercentage > 0.75) {
		// 	dayContainer?.scrollTo({ left: dayContainerScrollLeft + dayWidth, behavior: 'smooth' });
		// } else {
		// 	centerDateButton(date);
		// }
	};

	const onDateChange = async (date: Date, callUpdateUrl = true) => {
		if (modelRunLocked) {
			if (date.getTime() < firstMetaTime.getTime()) {
				toast.warning("Model run locked, can't go before first time");
				return;
			}
		} else {
			const closest = closestModelRun(date, $selectedDomain.model_interval);
			console.log(closest);
			if (
				date.getTime() >= closest.getTime() &&
				closest.getTime() <= latestReferenceTime.getTime() &&
				closest.getTime() != $modelRun?.getTime()
			) {
				$time = new SvelteDate(date);
				await onModelRunChange(closest);
				return;
			}
		}

		$time = new SvelteDate(date);
		if (callUpdateUrl) updateUrl('time', fmtISOWithoutTimezone($time));
		changeOMfileURL();
	};

	let ctrl = $state(false);
	const keydownEvent = (event: KeyboardEvent) => {
		if (event.keyCode == 17 || event.keyCode == 91) ctrl = true;

		const canNavigate = !($domainSelectionOpen || $variableSelectionOpen);
		if (!canNavigate) return;

		const actions: Record<string, () => void> = {
			ArrowLeft: ctrl ? previousModel : previousHour,
			ArrowRight: ctrl ? nextModel : nextHour,
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

	const keyupEvent = (event: KeyboardEvent) => {
		if (event.keyCode == 17 || event.keyCode == 91) ctrl = false;
	};

	onMount(() => {
		if (browser) {
			window.addEventListener('keydown', keydownEvent);
			window.addEventListener('keyup', keyupEvent);
		}
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('keydown', keydownEvent);
			window.removeEventListener('keyup', keyupEvent);
		}
	});

	const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const millisecondsPerDay = 24 * 60 * 60 * 1000;

	const firstMetaTime = $derived(new Date($metaJson?.valid_times[0] as string));
	const lastMetaTime = $derived(
		new Date($metaJson?.valid_times[$metaJson?.valid_times.length - 1] as string)
	);
	const latestReferenceTime = $derived(new Date($latest?.reference_time as string));

	const timeSteps = $derived(
		$metaJson?.valid_times.map((validTime: string) => new SvelteDate(validTime))
	);

	const findTimeStep = (date: Date | SvelteDate) => {
		return timeSteps?.findLast((tS) => tS.getTime() <= date.getTime());
	};

	const currentIndex = $derived(
		timeSteps ? timeSteps.findLastIndex((tS) => tS.getTime() <= $time.getTime()) : 0
	);

	const daySteps = $derived.by(() => {
		const days = [];
		const dates: string[] = [];
		if (timeSteps) {
			for (const timeStep of timeSteps) {
				let monthIndex = timeStep.getUTCMonth();
				let date = timeStep.getUTCDate();
				if (dates.includes(`${monthIndex}-${date}`)) {
					continue;
				} else {
					const newDay = new SvelteDate(timeStep);
					newDay.setUTCHours(0);
					newDay.setUTCMinutes(0);
					dates.push(`${monthIndex}-${date}`);
					days.push(newDay);
				}
			}
		}
		return days;
	});

	const timeStepsComplete = $derived.by(() => {
		const timeStepsComplete = [];
		for (let day of daySteps) {
			for (let i = 0; i <= 23; i++) {
				if (timeInterval === 0.25) {
					for (let j = 0; j < 60; j += 15) {
						const date = new SvelteDate(day);
						date.setUTCHours(i);
						date.setUTCMinutes(j);
						timeStepsComplete.push(date);
					}
				} else {
					const date = new SvelteDate(day);
					date.setUTCHours(i);
					timeStepsComplete.push(date);
				}
			}
		}
		return timeStepsComplete;
	});

	// $inspect(timeStepsComplete).with(console.log);

	let isDown = $state(false);
	let startX = $state(0);
	let startY = $state(0);
	let scrollLeft = $state(0);
	let scrollTop = $state(0);

	// onMount(() => {
	// 	if (hoursContainer) {
	// 		hoursContainer.scrollIntoView({
	// 			behavior: 'instant',
	// 			block: 'center',
	// 			inline: 'center'
	// 		});
	// 	}
	// });

	const centerDateButton = (hour: number, smooth = false) => {
		if (dayContainer) {
			const left = 1000;
			dayContainer.scrollTo({ left: left, behavior: smooth ? 'smooth' : 'instant' });
		}
	};

	const desktop = new MediaQuery('min-width: 768px');

	let percentage = $state(0);

	let dayContainer: HTMLElement | undefined = $state();
	let viewWidth = $state(0);
	let dayContainerScrollLeft: number = $state(0);
	let dayContainerScrollWidth: number = $state(0);

	let hoursHoverContainer: HTMLElement | undefined = $state();
	let hoursHoverContainerWidth: number = $state(0);

	let percentageVisible = $derived(hoursHoverContainerWidth / dayContainerScrollWidth);

	let hoveredHour = $derived(
		timeStepsComplete
			? timeStepsComplete[
					Math.round(
						(timeStepsComplete.length *
							(percentage * hoursHoverContainerWidth + dayContainerScrollLeft)) /
							dayContainerScrollWidth
					)
				]
			: firstMetaTime
	);

	let currentTimeStep = $derived(
		timeStepsComplete
			? timeStepsComplete.find((tS: Date) => tS.getTime() === $time.getTime())
			: undefined
	);

	let currentPercentage = $derived(
		!desktop.current
			? 0.5
			: currentTimeStep && timeStepsComplete
				? Math.min(
						Math.max(
							timeStepsComplete.indexOf(currentTimeStep) /
								timeStepsComplete.length /
								percentageVisible,
							0
						),
						100
					)
				: 0
	);

	const timeValid = (date: Date) => {
		if (date && timeSteps)
			for (let validTime of timeSteps) {
				if (validTime.getTime() === date.getTime()) {
					return true;
				}
			}
		return false;
	};

	let updateNowInterval: ReturnType<typeof setTimeout> | undefined;
	onMount(() => {
		if (updateNowInterval) clearInterval(updateNowInterval);
		updateNowInterval = setInterval(() => {
			now = new SvelteDate();
		}, 60 * 1000);

		if (hoursHoverContainer) {
			hoursHoverContainer.addEventListener('mousemove', (e) => {
				if (hoursHoverContainerWidth) percentage = e.layerX / hoursHoverContainerWidth;
			});
			hoursHoverContainer.addEventListener('mouseout', () => {
				percentage = 0;
			});
			hoursHoverContainer.addEventListener('click', () => {
				if (desktop.current) {
					let validTime = false;
					let timeStep =
						timeStepsComplete[
							Math.round(
								(timeStepsComplete.length *
									(percentage * hoursHoverContainerWidth + dayContainerScrollLeft)) /
									dayContainerScrollWidth
							)
						];

					if (timeSteps)
						for (let tS of timeSteps) {
							if (tS.getTime() === timeStep.getTime()) {
								validTime = true;
							}
						}

					if (
						!validTime &&
						timeStep.getTime() > firstMetaTime.getTime() &&
						timeStep.getTime() < lastMetaTime.getTime()
					) {
						const newTimeStep = findTimeStep(timeStep);
						if (newTimeStep) timeStep = newTimeStep;
					}

					if (timeStep) onDateChange(timeStep);
				}
			});
		}

		window.addEventListener('resize', () => {
			viewWidth = window.innerWidth;
		});

		const resizeObserver = new ResizeObserver(() => {
			if (dayContainer) {
				dayContainerScrollLeft = dayContainer.scrollLeft;
				dayContainerScrollWidth = dayContainer.scrollWidth;
				if (!desktop.current) {
					centerDateButton(currentDate);
				}
			}
		});

		const onScrollEvent = (e) => {
			const target = e.target as Element;
			const width = target.getBoundingClientRect().width;
			const left = target.scrollLeft;
			const percentage = left / width;

			if (left === 0) {
				currentDate.setUTCHours(0);
			}
			if (percentage) {
				let timeStep =
					timeStepsComplete[
						Math.round(
							(timeStepsComplete.length *
								(percentage * hoursHoverContainerWidth + dayContainerScrollLeft)) /
								(dayContainerScrollWidth - viewWidth / 2)
						)
					];
				if ($time.getTime() !== timeStep.getTime()) {
					currentDate = new SvelteDate(timeStep);
				}
			}
		};

		const onScrollEndEvent = () => {
			if (!desktop.current) {
				if (!isDown) {
					onDateChange(currentDate);
				}
			}
		};

		if (dayContainer) {
			dayContainerScrollWidth = dayContainer.scrollWidth;
			viewWidth = window.innerWidth;
			resizeObserver.observe(dayContainer);
			dayContainer.addEventListener('scroll', (e) => {
				if (dayContainer) {
					dayContainerScrollLeft = dayContainer.scrollLeft;
				}
				if (!desktop.current) {
					throttle(() => onScrollEvent(e), 150);
				}
			});
			dayContainer.addEventListener('scrollend', throttle(onScrollEndEvent, 150));

			dayContainer.addEventListener('mousedown', (e) => {
				if (!dayContainer) return;
				isDown = true;
				startX = e.pageX - dayContainer.offsetLeft;
				startY = e.pageY - dayContainer.offsetTop;
				scrollLeft = dayContainer.scrollLeft;
				scrollTop = dayContainer.scrollTop;
				if (dayContainer) dayContainer.style.cursor = 'grabbing';
			});
			// dayContainerParent.addEventListener('mouseleave', () => {
			// 	isDown = false;
			// 	if (dayContainer) dayContainer.style.cursor = 'grab';
			// });
			dayContainer.addEventListener('mouseup', () => {
				isDown = false;
				if (dayContainer) dayContainer.style.cursor = 'grab';
				onScrollEndEvent();
			});
			dayContainer.addEventListener('mousemove', (e) => {
				if (!isDown || !dayContainer) return;
				e.preventDefault();
				const x = e.pageX - dayContainer.offsetLeft;
				const y = e.pageY - dayContainer.offsetTop;
				const walkX = (x - startX) * 1; // Change this number to adjust the scroll speed
				const walkY = (y - startY) * 1; // Change this number to adjust the scroll speed
				dayContainer.scrollLeft = scrollLeft - walkX;
				dayContainer.scrollTop = scrollTop - walkY;
			});
			dayContainer.addEventListener('click', () => {
				console.log('clicked');
			});
		}
	});

	onDestroy(() => {
		clearInterval(updateNowInterval);
	});

	let modelRunLocked = $state(false);
	let modelRunSelectionOpen = $state(false);

	let previousModelSteps = $derived.by(() => {
		const previousModels = [];
		for (let day of Array.from({ length: Math.floor((6.9 * 24) / modelInterval) }, (_, i) => i)) {
			// 7 Days
			const date = new SvelteDate(latestReferenceTime);
			date.setUTCMinutes(0);
			date.setUTCSeconds(0);
			date.setUTCMilliseconds(0);
			date.setUTCHours(date.getUTCHours() - day * modelInterval);
			previousModels.push(date);
		}
		return previousModels;
	});

	let inProgressReferenceTime = $derived(
		$inProgress?.reference_time &&
			$latest?.reference_time &&
			$inProgress?.reference_time !== $latest?.reference_time
			? new Date($inProgress?.reference_time)
			: undefined
	);

	const onModelRunChange = async (step: Date) => {
		$loading = true;
		$modelRun = step;
		$metaJson = await getMetaData();

		let timeInNewModelRun = false;
		for (const vT of $metaJson.valid_times) {
			const validTime = new Date(vT);
			if (validTime.getTime() === $time.getTime()) {
				timeInNewModelRun = true;
			}
		}
		if (!timeInNewModelRun) {
			onDateChange($modelRun);
		} else {
			changeOMfileURL();
		}

		if ($modelRun.getTime() !== latestReferenceTime.getTime()) {
			updateUrl('model_run', fmtISOWithoutTimezone($modelRun));
		} else {
			updateUrl('model_run', undefined);
		}
		toast.info('Model run set to: ' + fmtISOWithoutTimezone($modelRun));

		await tick();
		if (dayContainer) {
			dayContainerScrollLeft = dayContainer.scrollLeft;
			dayContainerScrollWidth = dayContainer.scrollWidth;
		}
	};
</script>

<div
	class="absolute bottom-0 w-full md:max-w-[75vw] -translate-x-1/2 left-1/2 {disabled
		? 'text-foreground/50 cursor-not-allowed'
		: ''} {$preferences.timeSelector ? '' : ''}"
>
	<div
		class="relative duration-750 {disabled ? 'pointer-events-none' : ''} {$preferences.timeSelector
			? 'opacity-100 bottom-0 '
			: 'pointer-events-none opacity-0 -bottom-22.5'}"
	>
		<!-- Hover container -->
		<div
			bind:this={hoursHoverContainer}
			bind:clientWidth={hoursHoverContainerWidth}
			class="absolute {!desktop.current ? 'pointer-events-none' : ''} md:mx-1 {modelRunSelectionOpen
				? 'bottom-15'
				: 'bottom-5'} w-full h-8.5 {percentage ? 'z-20' : 'z-10'} cursor-pointer duration-500"
		>
			<!-- Hover Tooltip -->
			{#if percentage && desktop.current}
				<div
					transition:fade={{ duration: 200 }}
					style="left: calc({percentage * 100}% - 33px); background-color: {dark
						? 'rgba(15, 15, 15, 0.95)'
						: 'rgba(240, 240, 240, 0.95)'}"
					class="absolute z-20 -top-8 p-0.5 w-16.5 text-center rounded {hoveredHour &&
					currentTimeStep &&
					currentTimeStep.getTime() === hoveredHour.getTime()
						? 'font-bold'
						: ''}"
				>
					<div class="relative {!timeValid(hoveredHour) ? 'text-foreground/50' : ''}">
						{#if hoveredHour}
							{pad(hoveredHour.getUTCHours())}:{pad(hoveredHour.getUTCMinutes())}
						{/if}
						<div
							style="background-color: {dark
								? 'rgba(15, 15, 15, 0.95)'
								: 'rgba(240, 240, 240, 0.95)'}"
							class="-z-10 absolute -bottom-2 w-3 h-3 bg-white rotate-45 -translate-x-1/2 left-1/2"
						></div>
					</div>
				</div>
			{:else if currentTimeStep}
				<!-- Current Tooltip -->
				<div
					transition:fade={{ duration: 200 }}
					style="left: max(-4px,min(calc({currentPercentage * 100}% - 33px - {desktop.current
						? dayContainerScrollLeft
						: 0}px),calc(100% - 70px))); background-color: {dark
						? 'rgba(15, 15, 15, 0.95)'
						: 'rgba(240, 240, 240, 0.95)'}"
					class="absolute {disabled
						? '-top-8 rounded'
						: '-top-6 rounded-t'}  p-0.5 w-16.5 text-center"
				>
					<div class="relative font-bold text-foreground">
						{#if currentTimeStep}
							{pad(currentTimeStep!.getUTCHours())}:{pad(currentTimeStep!.getUTCMinutes())}
						{/if}
						{#if disabled}
							<div
								transition:fade={{ duration: 200 }}
								style="background-color: {dark
									? 'rgba(15, 15, 15, 0.95)'
									: 'rgba(240, 240, 240, 0.95)'}"
								class="-z-10 absolute -bottom-2 w-3 h-3 bg-white rotate-45 -translate-x-1/2 left-1/2"
							></div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
		<!-- Model Run Toggle Button -->
		<a
			href="#"
			onclick={() => (modelRunSelectionOpen = !modelRunSelectionOpen)}
			style="background-color: {dark
				? 'rgba(15, 15, 15, 0.8)'
				: 'rgba(240, 240, 240, 0.85)'}; backdrop-filter: blur(4px);"
			class="{modelRunSelectionOpen
				? '-top-11 h-11'
				: '-top-4.5 h-4.5'} z-10 cursor-pointer right-0 absolute flex rounded-t-xl items-center px-2 gap-0.5"
		>
			{#if modelRunSelectionOpen && $modelRun}
				<div
					transition:slide={{ axis: 'x', duration: 500 }}
					class="{modelRunSelectionOpen
						? 'text-normal px-1 py-2 mr-0.5'
						: 'text-sm'}  text-nowrap overflow-hidden"
				>
					<small>{pad($modelRun.getUTCDate())}-{pad($modelRun.getUTCMonth() + 1)}</small>
					{pad($modelRun.getUTCHours())}:{pad($modelRun.getUTCMinutes())}
				</div>
			{/if}

			<button
				class="cursor-pointer w-4.5 h-4.5 flex items-center justify-center"
				onclick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					modelRunLocked = !modelRunLocked;
					toast(modelRunLocked ? 'Model run locked' : 'Model run unlocked');
				}}
				aria-label="Model Run Lock"
			>
				{#if modelRunLocked}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="text-red-800 dark:text-red-500 lucide lucide-lock-icon lucide-lock"
						><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path
							d="M7 11V7a5 5 0 0 1 10 0v4"
						/></svg
					>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="text-green-800 dark:text-green-600 lucide lucide-lock-open-icon lucide-lock-open"
						><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path
							d="M7 11V7a5 5 0 0 1 9.9-1"
						/></svg
					>
				{/if}
			</button>

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
		</a>
		<div
			style="background-color: {dark
				? 'rgba(15, 15, 15, 0.8)'
				: 'rgba(240, 240, 240, 0.85)'}; backdrop-filter: blur(4px); transition-duration: 500ms;"
			class="time-selector md:px-0 {modelRunSelectionOpen ? 'h-22.5' : 'h-12.5'} relative"
		>
			<div
				class="md:mx-1 absolute {!desktop.current
					? 'hidden'
					: ''} z-10 top-0 left-0 w-full h-5 cursor-pointer"
			>
				<!-- Hover Cursor -->
				{#if percentage}
					<div
						style="left: calc({percentage * 100}% - 0.5px);"
						class="absolute border border-r top-0 h-3"
					></div>
				{/if}
				<!-- Current Cursor -->
				<div
					style="left: max(-4px,min(calc({currentPercentage *
						100}% - 1px -  {dayContainerScrollLeft}px),calc(100% - 8px)));"
					class="absolute bg-red-700 dark:bg-red-500 z-20 w-1 top-0 h-3.5"
				></div>
			</div>

			<div bind:this={dayContainer} class="flex overflow-x-scroll md:mx-1 px-[50vw] md:px-0">
				{#if !$metaJson}
					<div class="min-w-75"></div>
				{:else}
					{#each daySteps as dayStep, i (i)}
						<div class="relative flex h-12.5 min-w-42.5 {!desktop.current ? 'select-none' : ''}">
							<!-- Day Names -->
							<div
								class="absolute flex mt-3.25 -translate-x-1/2 left-1/2 items-center justify-center text-center flex-col"
							>
								<div class="">{dayNames[dayStep.getDay()]}</div>
								<small class="-mt-2"
									>{pad(dayStep.getUTCDate())}-{pad(dayStep.getUTCMonth() + 1)}</small
								>
							</div>
							{#if dayStep.getDate() === now.getDate()}
								<div
									style="left: {dayWidth *
										((now.getTime() - dayStep.getTime()) /
											millisecondsPerDay)}px; width: calc({dayWidth}px/{timeInterval === 0.25
										? 72
										: 24});"
									class="absolute h-4.5 border-orange-500 z-20 border-l-3 border-dotted"
								></div>
							{/if}

							<!-- Hour / 15 Minutes Lines -->
							<div class="flex mt-1 ml-0 pointer-events-none {i === 0 ? 'justify-self-end' : ''}">
								{#each timeStepsComplete as timeStep, j (j)}
									{#if timeStep.getTime() >= dayStep.getTime() && timeStep.getTime() < dayStep.getTime() + millisecondsPerDay}
										<div
											style="width: calc({dayWidth}px/{timeInterval === 0.25 ? 96 : 24});"
											class="h-1.25 {timeInterval !== 0.25 && j % 12 === 0 && j !== 0
												? 'h-3.25'
												: ''} {timeInterval !== 0.25 && j % 3 === 0
												? 'h-2.5'
												: ''} {timeInterval !== 0.25 && j % 24 === 0 && j !== 0
												? 'h-6'
												: ''} {timeInterval === 0.25 && j % 4 === 0
												? 'h-2.5'
												: ''} {timeInterval === 0.25 && j % 16 === 0 && j !== 0
												? 'h-3.25'
												: ''} border-l-2
												{!timeSteps?.find((tS) => timeStep.getTime() === tS.getTime()) ? 'border-foreground/20' : ''}"
										></div>
									{/if}
								{/each}
							</div>
						</div>
					{/each}
				{/if}
			</div>

			{#if modelRunSelectionOpen}
				<!-- Model Run Selection -->
				<div
					transition:slide={{ duration: 500 }}
					class="absolute right-0 w-full bottom-0 h-10 {modelRunLocked
						? 'opacity-60 cursor-not-allowed'
						: ''}"
				>
					<div
						class="{modelRunLocked
							? 'pointer-events-none'
							: ''} h-10 border-t relative px-4 gap-1 flex-row-reverse overflow-x-scroll items-center flex"
					>
						{#if inProgressReferenceTime && $modelRun}
							<button
								onclick={() => {
									onModelRunChange(inProgressReferenceTime);
								}}
								class="px-1.5 py-0.5 border-2 flex items-center text-nowrap rounded gap-1 hover:bg-accent cursor-pointer {inProgressReferenceTime.getTime() ===
								firstMetaTime.getTime()
									? 'border-orange-500 dark:border-orange-300'
									: ''} {inProgressReferenceTime.getTime() === $modelRun.getTime()
									? ''
									: 'border-transparent'}"
								>IP <small
									>{pad(inProgressReferenceTime.getUTCDate())}-{pad(
										inProgressReferenceTime.getUTCMonth() + 1
									)}</small
								>
								{pad(inProgressReferenceTime.getUTCHours())}:{pad(
									inProgressReferenceTime.getUTCMinutes()
								)}</button
							>
						{/if}
						{#each previousModelSteps as previousModelStep, i (i)}
							<button
								onclick={() => {
									onModelRunChange(previousModelStep);
								}}
								class="px-1.5 py-0.5 border-2 flex items-center text-nowrap rounded gap-1 hover:bg-accent cursor-pointer {previousModelStep.getTime() ===
									latestReferenceTime.getTime() &&
								previousModelStep.getTime() === firstMetaTime.getTime()
									? 'border-green-700 dark:border-green-500'
									: ''} {previousModelStep.getTime() === firstMetaTime.getTime()
									? ''
									: 'border-transparent'}"
								><small
									>{pad(previousModelStep.getUTCDate())}-{pad(
										previousModelStep.getUTCMonth() + 1
									)}</small
								>
								{pad(previousModelStep.getUTCHours())}:{pad(
									previousModelStep.getUTCMinutes()
								)}</button
							>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
