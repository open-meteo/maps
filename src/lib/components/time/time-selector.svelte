<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { MediaQuery, SvelteDate } from 'svelte/reactivity';
	import { fade } from 'svelte/transition';

	import { toast } from 'svelte-sonner';

	import { browser } from '$app/environment';

	import { loading, modelRun, preferences, time } from '$lib/stores/preferences';
	import { inProgress, latest, metaJson } from '$lib/stores/preferences';
	import {
		domainSelectionOpen,
		selectedDomain,
		variableSelectionOpen
	} from '$lib/stores/variables';

	import * as Select from '$lib/components/ui/select';

	import { changeOMfileURL, findTimeStep, getMetaData, throttle, updateUrl } from '$lib';
	import {
		formatISOWithoutTimezone,
		formatLocalDate,
		formatLocalTime,
		formatUTCDate,
		formatUTCDateTime,
		formatUTCTime,
		isValidTimeStep,
		startOfLocalDay,
		withLocalTime
	} from '$lib/time-format';

	let now = $state(new Date());
	let disabled = $derived($loading);
	let currentDate = $state(new Date($time));

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
		let ts = date.getTime();
		if (timeSteps && currentIndex - 1 >= 0) {
			date = timeSteps[currentIndex - 1];

			onDateChange(date);

			centerDateButton(date, true, 'backward', (ts - date.getTime()) / (60 * 60 * 1000));
		} else {
			// jump to next model run if available
			if (currentIndex - 1 < 0) {
				let date = new SvelteDate($time);
				if (timeInterval === 0.25) {
					date.setUTCMinutes(date.getUTCMinutes() - 15);
				} else {
					date.setUTCHours(date.getUTCHours() - timeInterval);
				}
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
		let ts = date.getTime();
		if (timeSteps && currentIndex + 1 <= timeSteps.length - 1) {
			date = timeSteps[currentIndex + 1];

			onDateChange(date);

			centerDateButton(date, true, 'forward', (date.getTime() - ts) / (60 * 60 * 1000));
		} else {
			if (timeSteps && currentIndex + 1 > timeSteps.length - 1) {
				if ($modelRun && $modelRun.getTime() < latestReferenceTime.getTime()) {
					let date = new SvelteDate($time);
					if (timeInterval === 0.25) {
						date.setUTCMinutes(date.getUTCMinutes() + 15);
					} else {
						date.setUTCHours(date.getUTCHours() + timeInterval);
					}
					onDateChange(date);
				} else {
					toast.warning('Already on latest timestep');
				}
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
		let ts = date.getTime();
		date.setUTCHours(date.getUTCHours() - 24);
		const timeStep = findTimeStep(date, timeSteps);
		if (timeStep) date = new SvelteDate(timeStep);
		onDateChange(date);

		centerDateButton(date, true, 'backward', (ts - date.getTime()) / (60 * 60 * 1000));
	};

	const nextDay = () => {
		let date = new SvelteDate($time);
		let ts = date.getTime();
		date.setUTCHours(date.getUTCHours() + 24);
		const timeStep = findTimeStep(date, timeSteps);
		if (timeStep) date = new SvelteDate(timeStep);
		onDateChange(date);

		centerDateButton(date, true, 'forward', (date.getTime() - ts) / (60 * 60 * 1000));
	};

	const onDateChange = async (date: Date, callUpdateUrl = true) => {
		if (modelRunLocked) {
			if (date.getTime() < firstMetaTime.getTime()) {
				toast.warning("Model run locked, can't go before first time");
				return;
			}
		}

		$time = new SvelteDate(date);
		currentDate = date;
		if (callUpdateUrl) updateUrl('time', formatISOWithoutTimezone($time));
		changeOMfileURL();
	};

	const onModelRunChange = async (step: Date) => {
		$loading = true;
		$modelRun = step;
		$metaJson = await getMetaData();

		let closestTime = new SvelteDate($modelRun);
		for (const vT of $metaJson.valid_times) {
			const validTime = new Date(vT);
			if (validTime.getTime() <= $time.getTime()) {
				closestTime.setTime(validTime.getTime());
			}
		}
		onDateChange(closestTime);

		if ($modelRun.getTime() !== latestReferenceTime.getTime()) {
			updateUrl('model_run', formatISOWithoutTimezone($modelRun));
		} else {
			updateUrl('model_run', undefined);
		}
		toast.info('Model run set to: ' + formatISOWithoutTimezone($modelRun));
		await tick();
		if (dayContainer) {
			dayContainerScrollLeft = dayContainer.scrollLeft;
			dayContainerScrollWidth = dayContainer.scrollWidth;
		}
	};

	const jumpToCurrentTime = () => {
		let date = new SvelteDate(now);
		if (timeInterval === 0.25) {
			date.setUTCMinutes(date.getUTCMinutes() + 15);
		} else {
			date.setUTCHours(date.getUTCHours() + timeInterval);
		}
		const timeStep = findTimeStep(date, timeSteps);
		if (timeStep) date = new SvelteDate(timeStep);

		onDateChange(date);
		if (desktop.current && currentPercentage < 0.25) {
			dayContainer?.scrollTo({ left: dayContainerScrollLeft - dayWidth, behavior: 'smooth' });
		} else {
			centerDateButton(date);
		}
	};

	const toggleModelRunLock = (event: Event | undefined) => {
		modelRunLocked = !modelRunLocked;
		toast.info(modelRunLocked ? 'Model run locked' : 'Model run unlocked');
		if (event) preventDefaultDialogues(event);
	};

	const preventDefaultDialogues = (event: Event) => {
		// prevent printing dialog, which is useless on a map anyway
		event.preventDefault();
		if (event.stopImmediatePropagation) {
			event.stopImmediatePropagation();
		} else {
			event.stopPropagation();
		}
		return;
	};

	const setModelRun = (event: Event, type: string = 'latest') => {
		if (type === 'latest') {
			onModelRunChange(latestReferenceTime);
		} else if (type === 'in-progress') {
			const inProgressReferenceTime = new Date($inProgress?.reference_time as string);
			if (inProgressReferenceTime.getTime() === latestReferenceTime.getTime()) {
				toast.warning('No model run in progress at this time');
			} else {
				onModelRunChange(inProgressReferenceTime);
			}
		}
		preventDefaultDialogues(event);
	};

	let ctrl = $state(false);
	const keyDownEvent = (event: KeyboardEvent) => {
		if (event.keyCode == 17 || event.keyCode == 91) ctrl = true;

		const canNavigate = !($domainSelectionOpen || $variableSelectionOpen);
		if (!canNavigate) return;

		const actions: Record<string, () => void> = {
			ArrowLeft: ctrl ? previousModel : previousHour,
			ArrowRight: ctrl ? nextModel : nextHour,
			ArrowDown: previousDay,
			ArrowUp: nextDay,
			c: ctrl ? () => {} : jumpToCurrentTime,
			m: ctrl ? () => toggleModelRunLock(event) : () => {},
			p: ctrl ? () => setModelRun(event, 'in-progress') : () => {},
			l: ctrl ? () => setModelRun(event, 'latest') : () => {}
		};

		const action = actions[event.key];
		if (!action) return;

		if (!disabled) {
			action();
		} else {
			toast.warning('Still loading another OM file');
		}
	};

	const keyUpEvent = (event: KeyboardEvent) => {
		if (event.keyCode == 17 || event.keyCode == 91) ctrl = false;
	};

	onMount(() => {
		if (browser) {
			window.addEventListener('keydown', keyDownEvent);
			window.addEventListener('keyup', keyUpEvent);
		}
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('keydown', keyDownEvent);
			window.removeEventListener('keyup', keyUpEvent);
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

	const currentIndex = $derived(
		timeSteps ? timeSteps.findLastIndex((tS) => tS.getTime() <= $time.getTime()) : 0
	);

	metaJson.subscribe(async () => {
		await tick();
		if (dayContainer) {
			dayContainerScrollLeft = dayContainer.scrollLeft;
			dayContainerScrollWidth = dayContainer.scrollWidth;
		}
		centerDateButton($time, false);
	});

	const daySteps = $derived.by(() => {
		const days = [];
		const dates: string[] = [];
		if (timeSteps) {
			for (const timeStep of timeSteps) {
				let monthIndex = timeStep.getMonth();
				let date = timeStep.getDate();
				if (dates.includes(`${monthIndex}-${date}`)) {
					continue;
				} else {
					dates.push(`${monthIndex}-${date}`);
					days.push(startOfLocalDay(timeStep));
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
						timeStepsComplete.push(withLocalTime(day, i, j));
					}
				} else {
					timeStepsComplete.push(withLocalTime(day, i));
				}
			}
		}
		return timeStepsComplete;
	});

	let isDown = $state(false);
	let startX = $state(0);
	let startY = $state(0);
	let scrollLeft = $state(0);
	let scrollTop = $state(0);

	const centerDateButton = (
		date: Date,
		smooth = false,
		direction: 'forward' | 'backward' = 'forward',
		diff = 1
	) => {
		if (dayContainer) {
			const index = timeStepsComplete.findIndex((tSC) => tSC.getTime() === date.getTime());
			if (index !== -1) {
				if (desktop.current) {
					if (dayContainerScrollWidth > hoursHoverContainerWidth - 8) {
						let scrollTo = false;
						if (direction === 'forward' && currentPercentageVisible > 0.66) {
							scrollTo = true;
						}

						if (
							direction === 'backward' &&
							currentPercentageVisible < 0.33 &&
							dayContainerScrollPercentage > 0
						) {
							scrollTo = true;
						}
						if (scrollTo) {
							const hourWidth = dayWidth / 24;
							const left =
								dayContainerScrollLeft +
								(direction === 'forward' ? hourWidth * diff : -hourWidth * diff);
							dayContainer.scrollTo({ left: left, behavior: smooth ? 'smooth' : 'instant' });
						}
					}
				} else {
					const hourWidth = dayWidth / 24;
					const left = hourWidth * index;
					dayContainer.scrollTo({ left: left, behavior: smooth ? 'smooth' : 'instant' });
				}
			}
		}
	};

	const desktop = new MediaQuery('min-width: 768px');

	let viewWidth = $state(0);
	let percentage = $state(0);

	let dayContainer: HTMLElement | undefined = $state();
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

	let dayContainerScrollPercentage = $derived(
		dayContainerScrollLeft / (dayContainerScrollWidth - hoursHoverContainerWidth)
	);
	let currentPercentageVisible = $derived(currentPercentage - dayContainerScrollPercentage);

	const timeValid = (date: Date) => isValidTimeStep(date, timeSteps);

	let resizeTimeout: ReturnType<typeof setTimeout> | undefined;
	let updateNowInterval: ReturnType<typeof setTimeout> | undefined;

	onMount(() => {
		if (updateNowInterval) clearInterval(updateNowInterval);
		updateNowInterval = setInterval(() => {
			now = new Date();
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
						const foundTimeStep = findTimeStep(timeStep, timeSteps);
						if (foundTimeStep) timeStep = new SvelteDate(foundTimeStep);
					}
					if (timeStep) {
						currentDate = timeStep;
						onDateChange(timeStep);
					}
					centerDateButton(timeStep);
				}
			});
		}

		window.addEventListener('resize', () => {
			viewWidth = window.innerWidth;
			if (dayContainer) {
				dayContainerScrollLeft = dayContainer.scrollLeft;
				dayContainerScrollWidth = dayContainer.scrollWidth;
			}

			clearTimeout(resizeTimeout);
			resizeTimeout = setTimeout(() => {
				if (dayContainer && !desktop.current) {
					centerDateButton(currentDate);
				}
			}, 100);
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

		const onScrollEvent = (e: Event) => {
			const target = e.target as Element;
			const width = target.getBoundingClientRect().width;
			const left = target.scrollLeft;
			const percentage = left / width;

			if (left === 0) {
				currentDate.setHours(0);
			}
			if (percentage) {
				let timeStep =
					timeStepsComplete[
						Math.round(
							(timeStepsComplete.length * (percentage * hoursHoverContainerWidth)) /
								(dayContainerScrollWidth - viewWidth)
						)
					];
				currentDate = new SvelteDate(timeStep);
			}
		};

		const onScrollEndEvent = () => {
			if (!desktop.current) {
				if (!isDown) {
					let timeStep = findTimeStep(currentDate, timeSteps);
					if (timeStep) currentDate = timeStep;
					onDateChange(currentDate);
					centerDateButton(currentDate);
				}
			}
		};

		if (dayContainer) {
			dayContainerScrollWidth = dayContainer.scrollWidth;
			viewWidth = window.innerWidth;
			resizeObserver.observe(dayContainer);

			const throttledOnScrollEvent = throttle((e: Event) => {
				onScrollEvent(e);
			}, 25);

			dayContainer.addEventListener('scroll', (e) => {
				if (dayContainer) {
					dayContainerScrollLeft = dayContainer.scrollLeft;
				}
				if (!desktop.current) {
					throttledOnScrollEvent(e);
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
		}
	});

	onDestroy(() => {
		clearInterval(updateNowInterval);
		if (resizeTimeout) clearTimeout(resizeTimeout);
	});

	let modelRunLocked = $state(false);

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
</script>

<div
	class="absolute bottom-0 w-full md:w-[unset] md:max-w-[75vw] -translate-x-1/2 left-1/2 {disabled
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
			class="absolute {!desktop.current
				? 'pointer-events-none'
				: ''} md:mx-1 bottom-5 w-full h-8.5 z-20 cursor-pointer duration-500"
		>
			<!-- Hover Tooltip -->
			{#if percentage && desktop.current && $metaJson}
				<div
					transition:fade={{ duration: 200 }}
					style="left: calc({percentage * 100}% - 33px);"
					class="absolute -top-8 p-0.5 w-16.5 text-center rounded bg-glass/95 {hoveredHour &&
					currentTimeStep &&
					currentTimeStep.getTime() === hoveredHour.getTime()
						? 'font-bold'
						: ''}"
				>
					<div class="relative {!timeValid(hoveredHour) ? 'text-foreground/50' : ''}">
						{#if hoveredHour}
							{formatLocalTime(hoveredHour)}
						{/if}
						<div
							class="-z-10 absolute -bottom-2 w-3 h-3 bg-glass/95 rotate-45 -translate-x-1/2 left-1/2"
						></div>
					</div>
				</div>
			{:else if currentTimeStep && $metaJson}
				<!-- Current Tooltip -->
				<div
					transition:fade={{ duration: 200 }}
					style="left: max(-33px,min(calc({currentPercentage * 100}% - 33px - {desktop.current
						? dayContainerScrollLeft
						: 0}px),calc(100% - 42px)));"
					class="absolute bg-glass rounded {disabled && desktop.current
						? '-top-8'
						: '-top-6'} {!desktop.current ? 'rounded-none!' : ''} p-0.5 w-16.5 text-center"
				>
					<div class="relative duration-500 {!disabled ? 'text-foreground' : ''}">
						{#if currentTimeStep}
							{#if desktop.current}
								<div class="font-bold">
									{formatLocalTime(currentTimeStep!)}
								</div>
							{:else}
								<div class={$time.getTime() === currentDate.getTime() ? 'font-bold' : ''}>
									{formatLocalTime(currentDate)}
								</div>
							{/if}
						{/if}
						{#if disabled && desktop.current}
							<div
								transition:fade={{ duration: 200 }}
								class="-z-10 absolute -bottom-2 w-3 h-3 bg-glass rotate-45 -translate-x-1/2 left-1/2"
							></div>
						{/if}
					</div>
				</div>
			{:else if !desktop.current && !$metaJson}
				<!-- Loading skeleton tooltip -->
				<div
					transition:fade={{ duration: 200 }}
					class="absolute bg-glass -top-6 rounded-none! p-0.5 w-16.5 text-center"
					style="left: max(-4px, calc(50% - 33px), calc(100% - 70px));"
				>
					<div class="h-4 bg-foreground/10 rounded animate-pulse"></div>
				</div>
			{:else if !desktop.current}
				<div
					transition:fade={{ duration: 200 }}
					style="left: max(-4px,min(calc({currentPercentage * 100}% - 33px - {desktop.current
						? dayContainerScrollLeft
						: 0}px),calc(100% - 70px)));"
					class="absolute bg-glass {disabled && desktop.current
						? '-top-8 rounded'
						: '-top-6 rounded-t'} {!desktop.current
						? 'rounded-none!'
						: ''} p-0.5 w-16.5 text-center"
				>
					<div class="relative duration-500 text-foreground text-bold">12:00</div>
				</div>
			{/if}
		</div>
		<!-- Model Run Selection Dropdown -->
		<div
			class="-top-4.5 h-4.5 z-10 right-0 absolute flex rounded-t-xl items-center px-2 gap-0.5 bg-glass backdrop-blur-sm"
		>
			<Select.Root
				type="single"
				value={$modelRun ? $modelRun.getTime().toString() : ''}
				onValueChange={(v) => {
					if (v) {
						const timestamp = parseInt(v);
						const selectedDate = new Date(timestamp);
						onModelRunChange(selectedDate);
					}
				}}
				disabled={modelRunLocked}
			>
				<Select.Trigger
					class="h-4.5!  text-xs pl-1.5 pr-0.75 py-0 gap-1 border-none bg-transparent shadow-none hover:bg-accent/50 focus-visible:ring-0 focus-visible:ring-offset-0 {modelRunLocked
						? 'opacity-60 cursor-not-allowed'
						: 'cursor-pointer'}"
					aria-label="Select model run"
				>
					{#if !$metaJson}
						<!-- Loading skeleton -->
						<div class="flex gap-1 items-center">
							<div class="h-3 w-12 bg-foreground/10 rounded animate-pulse"></div>
							<div class="h-3 w-8 bg-foreground/10 rounded animate-pulse"></div>
						</div>
					{:else if $modelRun}
						{formatUTCDate($modelRun)}
						{formatUTCTime($modelRun)}Z
					{:else}
						Select model run
					{/if}
				</Select.Trigger>
				<Select.Content
					class="left-5 border-none max-h-60 bg-glass/95 backdrop-blur-sm"
					sideOffset={8}
					align="end"
				>
					{#if inProgressReferenceTime && $modelRun}
						<Select.Item
							value={inProgressReferenceTime.getTime().toString()}
							label={`IP ${formatUTCDate(inProgressReferenceTime)} ${formatUTCTime(inProgressReferenceTime)}`}
							class="cursor-pointer {inProgressReferenceTime.getTime() === firstMetaTime.getTime()
								? 'text-orange-600 dark:text-orange-400 font-semibold'
								: ''}"
						>
							IP <small>{formatUTCDate(inProgressReferenceTime)}</small>
							{formatUTCTime(inProgressReferenceTime)}Z
						</Select.Item>
					{/if}
					{#each previousModelSteps as previousModelStep, i (i)}
						<Select.Item
							value={previousModelStep.getTime().toString()}
							label={formatUTCDateTime(previousModelStep)}
							class="cursor-pointer {previousModelStep.getTime() ===
								latestReferenceTime.getTime() &&
							previousModelStep.getTime() === firstMetaTime.getTime()
								? 'text-green-700 dark:text-green-500 font-semibold'
								: ''}"
						>
							<small>{formatUTCDate(previousModelStep)}</small>
							{formatUTCTime(previousModelStep)}Z
						</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>

			<button
				class="cursor-pointer w-3.5 -ml-0.5 h-4.5 pr-0.5 flex items-center justify-center"
				onclick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					toggleModelRunLock();
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
		</div>
		<button
			class="absolute bg-glass z-50 {desktop.current
				? '-left-7 h-12.5 w-7 rounded-s-xl'
				: 'left-[calc(50%-57px)] -top-7 h-7 rounded-tl-lg'} {disabled
				? 'cursor-not-allowed'
				: 'cursor-pointer'} "
			onclick={previousHour}
			aria-label="Previous Hour"
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
				class="lucide lucide-chevron-left-icon lucide-chevron-left"><path d="m15 18-6-6 6-6" /></svg
			>
		</button>
		<button
			class="absolute bg-glass z-50 {desktop.current
				? '-right-7 h-12.5 w-7 rounded-e-xl'
				: 'right-[calc(50%-57px)] -top-7 h-7 rounded-tr-lg'} {disabled
				? 'cursor-not-allowed'
				: 'cursor-pointer'} "
			onclick={nextHour}
			aria-label="Next Hour"
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
				class="lucide lucide-chevron-right-icon lucide-chevron-right"
				><path d="m9 18 6-6-6-6" /></svg
			>
		</button>
		<div class="time-selector md:px-0 h-12.5 relative bg-glass backdrop-blur-sm duration-500">
			<div
				class="md:mx-1 absolute {!desktop.current
					? 'pointer-events-none'
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
					style="left: max(-2px,min(calc({currentPercentage * 100}% - 1px -  {desktop.current
						? dayContainerScrollLeft
						: 0}px),calc(100% - 6px)));"
					class="absolute bg-red-700 dark:bg-red-500 z-20 w-1 top-0 h-3.5"
				></div>
			</div>

			<div bind:this={dayContainer} class="flex overflow-x-scroll md:mx-1 px-[50vw] md:px-0">
				{#if !$metaJson}
					<!-- Loading Skeleton -->
					{#each Array(7) as _, dayIndex (dayIndex)}
						<div class="relative flex h-12.5 min-w-42.5 animate-pulse">
							<!-- Skeleton Day Label -->
							<div
								class="absolute flex mt-3.25 -translate-x-1/2 left-1/2 items-center justify-center text-center flex-col"
							>
								<div class="h-4 w-16 bg-foreground/10 rounded mb-1"></div>
								<div class="h-3 w-12 bg-foreground/10 rounded"></div>
							</div>

							<!-- Skeleton Hour Lines -->
							<div class="flex mt-1 ml-0 pointer-events-none">
								{#each Array(24) as _, hourIndex (hourIndex)}
									<div
										style="width: calc({dayWidth}px/24);"
										class="h-{hourIndex % 12 === 0 && hourIndex !== 0
											? '3.25'
											: hourIndex % 3 === 0
												? '2.5'
												: '1.25'} border-l-2 border-foreground/10"
									></div>
								{/each}
							</div>
						</div>
					{/each}
				{:else}
					{#each daySteps as dayStep, i (i)}
						<div class="relative flex h-12.5 min-w-42.5 select-none">
							<!-- Day Names -->
							<div
								class="absolute flex mt-3.25 -translate-x-1/2 left-1/2 items-center justify-center text-center flex-col"
							>
								<div class="">{dayNames[dayStep.getDay()]}</div>
								<small class="-mt-2">{formatLocalDate(dayStep)}</small>
							</div>
							{#if dayStep.getDate() === now.getDate()}
								<div
									style="left: {dayWidth *
										((now.getTime() - dayStep.getTime()) /
											millisecondsPerDay)}px; width: calc({dayWidth}px/{timeInterval === 0.25
										? 72
										: 24});"
									class="absolute h-4.5 border-orange-500 z-20 border-l-2"
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
		</div>
	</div>
</div>
