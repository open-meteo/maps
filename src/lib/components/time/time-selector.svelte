<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { SvelteDate } from 'svelte/reactivity';
	import { fade } from 'svelte/transition';

	import { closestModelRun, domainStep } from '@openmeteo/mapbox-layer';
	import { toast } from 'svelte-sonner';

	import { browser } from '$app/environment';

	import { desktop, loading, preferences } from '$lib/stores/preferences';
	import { metaJson, modelRunLocked } from '$lib/stores/time';
	import { inProgress, latest, modelRun, now, time } from '$lib/stores/time';
	import {
		domainSelectionOpen,
		selectedDomain,
		variableSelectionOpen
	} from '$lib/stores/variables';
	import { domain as domainStore, variable as variableStore } from '$lib/stores/variables';

	import * as Select from '$lib/components/ui/select';

	import { changeOMfileURL, findTimeStep, getMetaData, throttle, updateUrl } from '$lib';
	import {
		DAY_NAMES,
		MILLISECONDS_PER_DAY,
		MILLISECONDS_PER_HOUR,
		MILLISECONDS_PER_WEEK
	} from '$lib/constants';
	import {
		type PrefetchMode,
		getDateRangeForMode,
		getPrefetchModeLabel,
		prefetchData
	} from '$lib/prefetch';
	import {
		formatISOWithoutTimezone,
		formatLocalDate,
		formatLocalTime,
		formatUTCDate,
		formatUTCDateTime,
		formatUTCOffset,
		formatUTCTime,
		isValidTimeStep,
		startOfLocalDay,
		withLocalTime
	} from '$lib/time-format';

	// Disables time selection when loading new OM files
	let disabled = $derived($loading);
	// Tracks the currently selected date for display and navigation
	let currentDate = $state(new Date($time));

	// Converts the selected domain's model interval to hours for calculations
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
			case 'monthly':
				return 720;
			default:
				return 1;
		}
	});

	// Navigate to the previous available time step
	const previousHour = () => {
		let date = new SvelteDate($time);
		if (timeSteps && currentIndex - 1 >= 0) {
			date = timeSteps[currentIndex - 1];
			onDateChange(date);
			isScrolling = true;
			centerDateButton(date);
		} else {
			// jump to next model run if available
			if (currentIndex - 1 < 0) {
				let date = new SvelteDate($time);
				date.setTime(date.getTime() - metaFirstResolution);
				onDateChange(date);
			}
		}
	};

	const previousModel = () => {
		const currentIndex = previousModelSteps.findIndex((pMS) =>
			$modelRun ? $modelRun.getTime() === pMS.getTime() : false
		);
		if (currentIndex !== -1) {
			onModelRunChange(previousModelSteps[currentIndex + 1]);
		}
		if (
			$modelRun &&
			inProgressReferenceTime &&
			$modelRun.getTime() === inProgressReferenceTime.getTime()
		) {
			onModelRunChange(latestReferenceTime);
		}
	};

	// Navigate to the next available time step
	const nextHour = () => {
		let date = new SvelteDate($time);
		if (timeSteps && currentIndex + 1 <= timeSteps.length - 1) {
			date = timeSteps[currentIndex + 1];
			onDateChange(date);
			isScrolling = true;
			centerDateButton(date);
		} else {
			if (timeSteps && currentIndex + 1 > timeSteps.length - 1) {
				if ($modelRun && $modelRun.getTime() < latestReferenceTime.getTime()) {
					let date = new SvelteDate($time);
					date.setTime(date.getTime() + metaLastResolution);
					onDateChange(date);
				} else {
					toast.warning('Already on latest timestep');
				}
			}
		}
	};

	const nextModel = () => {
		const currentIndex = previousModelSteps.findIndex((pMS) =>
			$modelRun ? $modelRun.getTime() === pMS.getTime() : false
		);
		if (currentIndex !== -1) {
			if (currentIndex === 0) {
				if (
					$modelRun &&
					inProgressReferenceTime &&
					inProgressReferenceTime.getTime() !== $modelRun.getTime() &&
					inProgressReferenceTime.getTime() > latestReferenceTime.getTime()
				) {
					onModelRunChange(inProgressReferenceTime);
				} else {
					toast.warning('Already on latest model');
				}
			} else {
				onModelRunChange(previousModelSteps[currentIndex - 1]);
			}
		} else {
			if (
				$modelRun &&
				inProgressReferenceTime &&
				inProgressReferenceTime.getTime() === $modelRun.getTime()
			) {
				toast.warning('Already on in-progress model');
			}
		}
	};

	const previousDay = () => {
		let date = new SvelteDate($time);
		date.setUTCHours(date.getUTCHours() - 24);
		const timeStep = findTimeStep(date, timeSteps);
		if (timeStep) date = new SvelteDate(timeStep);
		onDateChange(date);
		isScrolling = true;
		centerDateButton(date);
	};

	const nextDay = () => {
		let date = new SvelteDate($time);
		date.setUTCHours(date.getUTCHours() + 24);
		const timeStep = findTimeStep(date, timeSteps);
		if (timeStep && timeStep.getTime() !== $time.getTime()) {
			date = new SvelteDate(timeStep);
			onDateChange(date);
			isScrolling = true;
			centerDateButton(date);
		} else {
			if ($modelRun && $modelRun.getTime() < latestReferenceTime.getTime()) {
				onDateChange(date);
			} else {
				toast.warning('Already on latest timestep');
			}
		}
	};

	const checkClosestModelRun = async () => {
		let timeStep = new Date($time);

		let nearestModelRun = closestModelRun(timeStep, $selectedDomain.model_interval);
		if (nearestModelRun.getTime() > latestReferenceTime.getTime()) {
			nearestModelRun = latestReferenceTime;
		}

		// other than seasonal models, data is not available longer than 7 days
		if ($selectedDomain.model_interval !== 'monthly') {
			// check that requested timeStep is not older than 7 days
			const date7DaysAgo = Date.now() - MILLISECONDS_PER_WEEK;
			if (timeStep.getTime() < date7DaysAgo) {
				toast.warning('Date selected too old, using 7 days ago time');
				const nowTimeStep = domainStep(
					new Date(date7DaysAgo),
					$selectedDomain.time_interval,
					'floor'
				);
				time.set(nowTimeStep);
				timeStep = nowTimeStep;
			}
		}

		// check that requested time is not newer than the last valid_time in the DomainMetaData when MetaData not latest
		if ($metaJson) {
			if (timeStep.getTime() > metaLastTime.getTime()) {
				// latest is last model available
				if (metaReferenceTime.getTime() >= latestReferenceTime.getTime()) {
					toast.warning('Date selected too new, using latest available time');
					time.set(new Date(metaLastTime));
					timeStep = new Date(metaLastTime);
				}
			}
		}

		let setToModelRun = new SvelteDate($modelRun);

		if (
			nearestModelRun.getTime() > metaReferenceTime.getTime() &&
			nearestModelRun.getTime() <= latestReferenceTime.getTime()
		) {
			setToModelRun = new SvelteDate(nearestModelRun);
		} else if ($modelRun && timeStep.getTime() < $modelRun.getTime()) {
			setToModelRun = new SvelteDate(nearestModelRun);
		} else {
			if ($modelRun && latestReferenceTime.getTime() === $modelRun.getTime()) {
				updateUrl('model_run', undefined); // remove model_run from url when on latest
			} else if (
				$modelRun &&
				timeStep.getTime() > metaReferenceTime.getTime() &&
				metaReferenceTime.getTime() > $modelRun.getTime()
			) {
				setToModelRun = new SvelteDate(metaReferenceTime);
			} else if (timeStep.getTime() < metaReferenceTime.getTime()) {
				if ($modelRun && $modelRun.getTime() < nearestModelRun.getTime()) {
					setToModelRun = new SvelteDate(nearestModelRun);
				}
			}
		}

		if (!$modelRunLocked && $modelRun && setToModelRun.getTime() !== $modelRun.getTime()) {
			$modelRun = new Date(setToModelRun);
			try {
				$metaJson = await getMetaData();
			} catch (e) {
				const error = e as Error;
				toast.warning(error.message);
				// set to latest
				$time = new Date(latestReferenceTime);
				$modelRun = new Date(latestReferenceTime);
				$metaJson = $latest;
			}
			if ($modelRun.getTime() !== latestReferenceTime.getTime()) {
				updateUrl('model_run', formatISOWithoutTimezone($modelRun));
			} else {
				updateUrl('model_run', undefined);
			}
		} else {
			updateUrl();
		}
	};

	// updates the selected time and synchronizes with URL and OM file
	const onDateChange = async (date: Date) => {
		if ($modelRunLocked) {
			if (date.getTime() < metaFirstTime.getTime()) {
				toast.warning("Model run locked, can't go before first time");
				currentDate = new SvelteDate($time);
				centerDateButton(currentDate);
				return;
			}
			if (date.getTime() > metaLastTime.getTime()) {
				toast.warning("Model run locked, can't go after last time");
				currentDate = new SvelteDate($time);
				centerDateButton(currentDate);
				return;
			}
		}

		$time = new SvelteDate(date);
		currentDate = date;
		updateUrl('time', formatISOWithoutTimezone($time));
		await checkClosestModelRun();
		changeOMfileURL();
	};

	// changes the selected model run and updates available time steps
	const onModelRunChange = async (step: Date) => {
		$loading = true;
		$modelRunLocked = true;
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

		await tick();
		if (dayContainer) {
			dayContainerScrollLeft = dayContainer.scrollLeft;
			dayContainerScrollWidth = dayContainer.scrollWidth;
		}
	};

	const jumpToCurrentTime = () => {
		let date = new SvelteDate($now);
		date.setTime(date.getTime() + metaFirstResolution); // next time step
		const timeStep = findTimeStep(date, timeSteps);
		if (timeStep) date = new SvelteDate(timeStep);
		onDateChange(date);
		centerDateButton(date);
	};

	const toggleModelRunLock = () => {
		$modelRunLocked = !$modelRunLocked;
		toast.info($modelRunLocked ? 'Model run locked' : 'Model run unlocked');
	};

	const setLatestModelRun = () => {
		if ($modelRun && $modelRun.getTime() === latestReferenceTime.getTime()) {
			toast.warning('Already on latest model run');
		} else {
			onModelRunChange(latestReferenceTime);
		}
	};

	// State to track prefetch progress and mode
	let isPrefetching = $state(false);
	let prefetchProgress = $state({ current: 0, total: 0 });
	let selectedPrefetchMode: PrefetchMode = $state('next24h');

	const prefetchModes: { value: PrefetchMode; label: string }[] = [
		{ value: 'next24h', label: 'Next 24h' },
		{ value: 'prev24h', label: 'Prev 24h' },
		{ value: 'completeModelRun', label: 'Full run' }
	];

	// Prefetch data using the selected mode
	const handlePrefetch = async () => {
		if (!$metaJson || !$modelRun) {
			toast.warning('No metadata available for prefetching');
			return;
		}

		if (isPrefetching) {
			toast.warning('Prefetch already in progress');
			return;
		}

		isPrefetching = true;
		prefetchProgress = { current: 0, total: 0 };

		const modeLabel = getPrefetchModeLabel(selectedPrefetchMode);
		toast.info(`Prefetching ${modeLabel}...`);

		const { startDate, endDate } = getDateRangeForMode(selectedPrefetchMode, $time, $metaJson);

		const result = await prefetchData(
			{
				startDate,
				endDate,
				metaJson: $metaJson,
				modelRun: $modelRun,
				domain: $domainStore,
				variable: $variableStore
			},
			(progress) => {
				prefetchProgress = progress;
			}
		);

		isPrefetching = false;

		if (result.success) {
			toast.success(`Prefetched ${result.successCount}/${result.totalCount} time steps`);
		} else {
			toast.error(result.error || 'Prefetch failed');
		}
	};

	// throttled versions of the navigation functions
	const throttledPreviousHour = throttle(previousHour, 150);
	const throttledNextHour = throttle(nextHour, 150);
	const throttledPreviousDay = throttle(previousDay, 150);
	const throttledNextDay = throttle(nextDay, 150);

	let ctrl = $state(false);
	const keyDownEvent = (event: KeyboardEvent) => {
		if (event.keyCode == 17 || event.keyCode == 91) ctrl = true;

		const canNavigate = !($domainSelectionOpen || $variableSelectionOpen);
		if (!canNavigate) return;

		const actions: Record<string, () => void> = {
			ArrowLeft: ctrl ? previousModel : throttledPreviousHour,
			ArrowRight: ctrl ? nextModel : throttledNextHour,
			ArrowDown: throttledPreviousDay,
			ArrowUp: throttledNextDay,
			c: ctrl ? () => {} : jumpToCurrentTime,
			m: ctrl ? () => {} : () => toggleModelRunLock(),
			n: ctrl ? () => {} : () => setLatestModelRun()
		};

		const action = actions[event.key];
		if (!action) return;

		// check if loading
		if (!disabled || ['m'].includes(event.key)) {
			action();
		} else {
			// toast.warning('Still loading another OM file');
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

	const latestReferenceTime = $derived(new Date($latest?.reference_time as string));

	const metaReferenceTime = $derived(new Date($metaJson?.reference_time as string));

	const metaFirstTime = $derived(new Date($metaJson?.valid_times[0] as string));
	const metaFirstResolution = $derived.by(() => {
		const metaSecondTime = new Date($metaJson?.valid_times[1] as string);
		return metaSecondTime.getTime() - metaFirstTime.getTime();
	});
	const metaFirstResolutionHours = $derived(metaFirstResolution / MILLISECONDS_PER_HOUR);

	const metaLastTime = $derived(
		new Date($metaJson?.valid_times[$metaJson?.valid_times.length - 1] as string)
	);
	const metaLastResolution = $derived.by(() => {
		const metaSecondToLastTime = new Date(
			$metaJson?.valid_times[$metaJson?.valid_times.length - 2] as string
		);
		return metaLastTime.getTime() - metaSecondToLastTime.getTime();
	});

	// Calculates the pixel width of each day in the calendar based on time interval
	let dayWidth = $derived(metaFirstResolutionHours === 0.25 ? 340 : 170);

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

	// unique days from available time steps
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

	// generates all possible time steps for the current day
	const timeStepsComplete = $derived.by(() => {
		const timeStepsComplete = [];
		for (let day of daySteps) {
			for (let i = 0; i <= 23; i++) {
				if (metaFirstResolutionHours === 0.25) {
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

	// state variables for mouse interaction and scrolling behavior
	let isDown = $state(false);
	let startX = $state(0);
	let startY = $state(0);
	let scrollLeft = $state(0);
	let scrollTop = $state(0);
	let isScrolling = $state(false);

	const centerDateButton = (date: Date, smooth = true) => {
		if (dayContainer) {
			const index = timeStepsComplete.findIndex((tSC) => tSC.getTime() === date.getTime());
			if (index !== -1) {
				if (desktop.current) {
					if (dayContainerScrollWidth > hoursHoverContainerWidth) {
						if (currentPercentage > 0.66) {
							isScrolling = true;
							const left = -(0.66 - currentTotalPercentage) * hoursHoverContainerWidth;
							dayContainer.scrollTo({
								left: left,
								behavior: smooth ? 'smooth' : 'instant'
							});
						}
						if (currentPercentage < 0.33) {
							isScrolling = true;
							const left = -(0.33 - currentTotalPercentage) * hoursHoverContainerWidth;
							dayContainer.scrollTo({
								left: left,
								behavior: smooth ? 'smooth' : 'instant'
							});
						}
					}
				} else {
					const hourWidth = metaFirstResolutionHours === 0.25 ? dayWidth / 96 : dayWidth / 24;
					const left = hourWidth * index;
					dayContainer.scrollTo({ left: left, behavior: smooth ? 'smooth' : 'instant' });
				}
			}
		}
	};

	let hoverX = $state(0);
	let viewWidth = $state(0);

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
						(timeStepsComplete.length * (hoverX + dayContainerScrollLeft)) / dayContainerScrollWidth
					)
				]
			: metaFirstTime
	);

	let currentTimeStep = $derived(
		timeStepsComplete
			? timeStepsComplete.find((tS: Date) => tS.getTime() === $time.getTime())
			: undefined
	);

	let currentTotalPercentage = $derived(
		!desktop.current
			? 0.5
			: currentTimeStep && timeStepsComplete
				? timeStepsComplete.indexOf(currentTimeStep) / timeStepsComplete.length / percentageVisible
				: 0
	);

	let currentPosition = $derived(
		currentTotalPercentage * hoursHoverContainerWidth - dayContainerScrollLeft
	);

	let currentPercentage = $derived(currentPosition / hoursHoverContainerWidth);

	const timeValid = (date: Date) => isValidTimeStep(date, timeSteps);

	let resizeTimeout: ReturnType<typeof setTimeout> | undefined;
	const horizontalScrollSpeed = 1;

	const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
	onMount(() => {
		if (hoursHoverContainer) {
			hoursHoverContainer.addEventListener('mousemove', (e) => {
				if (hoursHoverContainerWidth)
					hoverX = e.layerX + (isSafari ? hoursHoverContainerWidth / 2 : 0);
			});
			hoursHoverContainer.addEventListener('mouseout', () => {
				hoverX = 0;
			});
			hoursHoverContainer.addEventListener('click', () => {
				if (desktop.current) {
					let validTime = false;
					let timeStep =
						timeStepsComplete[
							Math.round(
								(timeStepsComplete.length * (hoverX + dayContainerScrollLeft)) /
									dayContainerScrollWidth
							)
						];

					if (timeStep && timeSteps)
						for (let tS of timeSteps) {
							if (tS.getTime() === timeStep.getTime()) {
								validTime = true;
							}
						}

					if (
						timeStep &&
						!validTime &&
						timeStep.getTime() > metaFirstTime.getTime() &&
						timeStep.getTime() < metaLastTime.getTime()
					) {
						const foundTimeStep = findTimeStep(timeStep, timeSteps);
						if (foundTimeStep) timeStep = new SvelteDate(foundTimeStep);
					}
					if (timeStep) {
						currentDate = timeStep;
						onDateChange(timeStep);
						centerDateButton(timeStep);
					}
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
					isScrolling = true;
					centerDateButton(currentDate, false);
				}
			}, 100);
		});

		const resizeObserver = new ResizeObserver(() => {
			if (dayContainer) {
				dayContainerScrollLeft = dayContainer.scrollLeft;
				dayContainerScrollWidth = dayContainer.scrollWidth;
				if (!desktop.current) {
					isScrolling = true;
					centerDateButton(currentDate, false);
				}
			}
		});

		const onScrollEvent = (e: Event) => {
			if (isScrolling) return;

			const target = e.target as Element;
			const left = target.scrollLeft;

			if (left === 0) {
				currentDate.setHours(0);
			}
			let timeStep =
				timeStepsComplete[
					Math.round(
						(timeStepsComplete.length * target.scrollLeft) / (dayContainerScrollWidth - viewWidth)
					)
				];
			if (timeStep) currentDate = new SvelteDate(timeStep);
		};

		const onScrollEndEvent = () => {
			// Clear isScrolling flag when scrolling ends
			isScrolling = false;

			if (!desktop.current && !isDown) {
				if ($loading) {
					centerDateButton($time);
					currentDate = new SvelteDate($time);
				} else {
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

			const throttledScrollEvent = throttle((e: Event) => {
				onScrollEvent(e);
			}, 25);

			const throttledScrollEndEvent = throttle(() => {
				onScrollEndEvent();
			}, 150);

			dayContainer.addEventListener('scroll', (e) => {
				if (dayContainer) {
					dayContainerScrollLeft = dayContainer.scrollLeft;
				}
				if (!desktop.current) {
					throttledScrollEvent(e);
				}
			});
			dayContainer.addEventListener('scrollend', throttledScrollEndEvent);
			dayContainer.addEventListener('mousedown', (e) => {
				if (!desktop.current) {
					if (!dayContainer) return;
					isDown = true;
					startX = e.pageX - dayContainer.offsetLeft;
					startY = e.pageY - dayContainer.offsetTop;
					scrollLeft = dayContainer.scrollLeft;
					scrollTop = dayContainer.scrollTop;
					if (dayContainer) dayContainer.style.cursor = 'grabbing';
				}
			});
			dayContainer.addEventListener('mouseup', () => {
				if (!desktop.current) {
					isDown = false;
					if (dayContainer) dayContainer.style.cursor = 'grab';
					onScrollEndEvent();
				}
			});
			dayContainer.addEventListener('mousemove', (e) => {
				if (!desktop.current) {
					if (!isDown || !dayContainer) return;
					e.preventDefault();
					const x = e.pageX - dayContainer.offsetLeft;
					const y = e.pageY - dayContainer.offsetTop;
					const walkX = (x - startX) * horizontalScrollSpeed;
					const walkY = (y - startY) * horizontalScrollSpeed;
					dayContainer.scrollLeft = scrollLeft - walkX;
					dayContainer.scrollTop = scrollTop - walkY;
				}
			});
		}
	});

	onDestroy(() => {
		if (resizeTimeout) clearTimeout(resizeTimeout);
	});

	let previousModelSteps = $derived.by(() => {
		const previousModels = [];
		for (let day of Array.from({ length: Math.floor((6.9 * 24) / modelInterval) }, (_, i) => i)) {
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
	class="fixed bottom-0 w-full md:w-[unset] md:max-w-[75vw] -translate-x-1/2 left-1/2 z-40 {disabled
		? 'text-foreground/50 cursor-not-allowed'
		: ''} {$preferences.timeSelector ? '' : 'pointer-events-none'}"
>
	<div
		class="duration-500 select-none {disabled
			? 'pointer-events-none'
			: ''} {$preferences.timeSelector
			? 'opacity-100 translate-y-0'
			: 'pointer-events-none opacity-0 translate-y-15'}"
	>
		<!-- Hover container -->
		<div
			bind:this={hoursHoverContainer}
			bind:clientWidth={hoursHoverContainerWidth}
			class="absolute {!desktop.current
				? 'pointer-events-none'
				: ''} bottom-5 w-full h-8.5 z-20 cursor-pointer duration-500"
		>
			<!-- Hover Tooltip -->
			{#if $metaJson}
				{#if hoverX && desktop.current}
					<div
						transition:fade={{ duration: 200 }}
						style="left: calc({hoverX}px - 33px);"
						class="absolute shadow-md -top-8 p-0.5 w-16.5 text-center rounded bg-glass backdrop-blur-sm {hoveredHour &&
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
								class="-z-10 absolute -bottom-2 w-3 h-3 bg-glass backdrop-blur-sm rotate-45 -translate-x-1/2 left-1/2"
								style="clip-path: polygon(0% 100%, 100% 100%, 100% 0%);"
							></div>
						</div>
					</div>
				{:else if currentTimeStep}
					<!-- Current Tooltip -->
					<div
						transition:fade={{ duration: 200 }}
						style="left: clamp(-28px, calc({desktop.current
							? currentPosition - 33
							: 0.5 * hoursHoverContainerWidth - 33}px), calc(100% - 38px));"
						class="absolute bg-glass md:shadow-md backdrop-blur-sm rounded {disabled &&
						desktop.current
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
									style="clip-path: polygon(0% 100%, 100% 100%, 100% 0%);"
								></div>
							{/if}
						</div>
					</div>
				{/if}
			{:else if desktop.current}
				<!-- Loading skeleton tooltip -->
				<div
					transition:fade={{ duration: 200 }}
					class="absolute flex items-center justify-center bg-glass h-4.5 backdrop-blur-sm -top-6 rounded-none! p-0.5 w-16.5 text-center"
					style="left: clamp(-4px, calc(50% - 33px), calc(100% - 70px));"
				>
					<div class="h-3 w-8 bg-foreground/10 rounded animate-pulse"></div>
				</div>
			{:else}{/if}
		</div>
		<!-- Model Run Selection Dropdown -->
		<div
			class="-top-4.5 h-4.5 z-10 right-0 absolute flex rounded-t-lg items-center px-2 gap-0.5 bg-glass backdrop-blur-sm"
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
			>
				<Select.Trigger
					class="h-4.5! text-xs pl-1.5 pr-0.75 py-0 gap-1 border-none bg-transparent shadow-none hover:bg-accent/50 focus-visible:ring-0 focus-visible:ring-offset-0 cursor-pointer"
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
					class="left-5 border-none max-h-60 bg-glass backdrop-blur-sm"
					sideOffset={4}
					align="end"
				>
					{#if inProgressReferenceTime && $modelRun}
						<Select.Item
							value={inProgressReferenceTime.getTime().toString()}
							label={`IP ${formatUTCDate(inProgressReferenceTime)} ${formatUTCTime(inProgressReferenceTime)}`}
							class="cursor-pointer border-l-4 border-l-orange-600 dark:border-l-orange-400 [&_svg]:text-orange-600 dark:[&_svg]:text-orange-400 {inProgressReferenceTime.getTime() ===
							metaFirstTime.getTime()
								? 'text-orange-600 dark:text-orange-400 font-semibold'
								: ''}"
						>
							<small class="min-w-8">{formatUTCDate(inProgressReferenceTime)}</small>
							{formatUTCTime(inProgressReferenceTime)}Z
						</Select.Item>
					{/if}
					{#each previousModelSteps as previousModelStep, i (i)}
						<Select.Item
							value={previousModelStep.getTime().toString()}
							label={formatUTCDateTime(previousModelStep)}
							class="cursor-pointer border-l-4 {previousModelStep.getTime() ===
							latestReferenceTime.getTime()
								? 'border-l-green-700 dark:border-l-green-500 [&_svg]:text-green-700 dark:[&_svg]:text-green-500'
								: 'border-l-transparent'} {previousModelStep.getTime() ===
								latestReferenceTime.getTime() &&
							previousModelStep.getTime() === metaFirstTime.getTime()
								? 'text-green-700 dark:text-green-500 font-semibold'
								: ''}"
						>
							<small class="min-w-8">{formatUTCDate(previousModelStep)}</small>
							{formatUTCTime(previousModelStep)}Z
						</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>

			<!-- Prefetch Button -->
			<button
				class="cursor-pointer w-4 h-4.5 flex items-center justify-center {isPrefetching
					? 'animate-pulse'
					: ''}"
				onclick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					handlePrefetch();
				}}
				disabled={isPrefetching}
				aria-label="Prefetch data"
				title={isPrefetching
					? `Prefetching ${prefetchProgress.current}/${prefetchProgress.total}...`
					: `Prefetch ${getPrefetchModeLabel(selectedPrefetchMode)}`}
			>
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
					class="{isPrefetching
						? 'text-blue-500'
						: 'text-foreground/70 hover:text-foreground'} lucide lucide-download-icon"
				>
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="7 10 12 15 17 10" />
					<line x1="12" x2="12" y1="15" y2="3" />
				</svg>
			</button>

			<!-- Prefetch Mode Select -->
			<Select.Root
				type="single"
				value={selectedPrefetchMode}
				onValueChange={(v) => {
					if (v) {
						selectedPrefetchMode = v as PrefetchMode;
					}
				}}
			>
				<Select.Trigger
					class="h-4.5! text-xs px-1.5 py-0 gap-0.5 border-none bg-transparent shadow-none hover:bg-accent/50 focus-visible:ring-0 focus-visible:ring-offset-0 cursor-pointer min-w-18"
					aria-label="Select prefetch mode"
				>
					{prefetchModes.find((m) => m.value === selectedPrefetchMode)?.label ?? 'Next 24h'}
				</Select.Trigger>
				<Select.Content class="border-none bg-glass backdrop-blur-sm" sideOffset={4} align="end">
					{#each prefetchModes as mode (mode.value)}
						<Select.Item value={mode.value} label={mode.label} class="cursor-pointer text-xs">
							{mode.label}
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
				{#if $modelRunLocked}
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
			class="absolute bg-glass backdrop-blur-sm z-50 {desktop.current
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
			class="absolute bg-glass backdrop-blur-sm z-50 {desktop.current
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
			{#if hoverX || currentDate.getTime() !== $time.getTime()}
				<div
					transition:fade={{ duration: 300 }}
					class="absolute {desktop.current ? '-left-6' : 'left-1.75'} -top-5 text-xs p-1"
				>
					UTC{formatUTCOffset($now)}
					{#if desktop.current}
						{Intl.DateTimeFormat().resolvedOptions().timeZone}
					{/if}
				</div>
			{/if}
			<div
				class="absolute {!desktop.current
					? 'pointer-events-none'
					: ''} z-10 top-0 left-0 w-full h-5 cursor-pointer"
			>
				<!-- Hover Cursor -->
				{#if hoverX}
					<div style="left: {hoverX}px;" class="absolute border border-r top-0 h-3"></div>
				{/if}
				<!-- Current Cursor -->
				<div
					style="left: clamp(-2px, {desktop.current
						? currentPosition - 1
						: 0.5 * hoursHoverContainerWidth - 1}px,calc(100% - 6px));"
					class="absolute bg-red-700 dark:bg-red-500 z-20 w-1 top-0 h-3.5"
				></div>
			</div>

			<div
				bind:this={dayContainer}
				class="flex overflow-x-scroll {desktop.current ? '' : 'px-[50vw]'}"
			>
				{#if !$metaJson || !$modelRun}
					<!-- Loading Skeleton -->
					{#each Array(7) as _, dayIndex (dayIndex)}
						<div
							class="relative flex h-12.5 {metaFirstResolutionHours === 0.25
								? 'min-w-85'
								: 'min-w-42.5'} animate-pulse"
						>
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
						<div
							class="relative flex h-12.5 {metaFirstResolutionHours === 0.25
								? 'min-w-85'
								: 'min-w-42.5'}"
						>
							<!-- Day Names -->
							<div
								class="absolute flex mt-3.25 -translate-x-1/2 left-1/2 items-center justify-center text-center flex-col"
							>
								<div class="">{DAY_NAMES[dayStep.getDay()]}</div>
								<small class="-mt-2">{formatLocalDate(dayStep)}</small>
							</div>
							{#if dayStep.getDate() === $now.getDate()}
								<div
									style="left: {dayWidth *
										(($now.getTime() - dayStep.getTime()) /
											MILLISECONDS_PER_DAY)}px; width: calc({dayWidth}px/{metaFirstResolutionHours ===
									0.25
										? 72
										: 24});"
									class="absolute h-4.5 border-orange-500 z-20 border-l-2"
								></div>
							{/if}

							<!-- Hour / 15 Minutes Lines -->
							<div class="flex mt-1 ml-0 pointer-events-none {i === 0 ? 'justify-self-end' : ''}">
								{#each timeStepsComplete as timeStep, j (j)}
									{#if timeStep.getTime() >= dayStep.getTime() && timeStep.getTime() < dayStep.getTime() + MILLISECONDS_PER_DAY}
										<div
											style="width: calc({dayWidth}px/{metaFirstResolutionHours === 0.25
												? 96
												: 24});"
											class="h-1.25 {metaFirstResolutionHours !== 0.25 && j % 12 === 0 && j !== 0
												? 'h-3.25'
												: ''} {metaFirstResolutionHours !== 0.25 && j % 3 === 0
												? 'h-2.5'
												: ''} {metaFirstResolutionHours !== 0.25 && j % 24 === 0 && j !== 0
												? 'h-6'
												: ''} {metaFirstResolutionHours === 0.25 && j % 4 === 0
												? 'h-2.5'
												: ''} {metaFirstResolutionHours === 0.25 && j % 16 === 0 && j !== 0
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
