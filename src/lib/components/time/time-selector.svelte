<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	import { SvelteDate } from 'svelte/reactivity';

	import { toast } from 'svelte-sonner';

	import { browser } from '$app/environment';

	import { pad } from '$lib/utils/pad';

	import type { Domain } from '$lib/types';

	interface Props {
		domain: Domain;
		timeSelected: Date;
		onDateChange: (date: Date) => void;
		disabled: boolean;
		showTimeSelector: boolean;
	}

	let {
		domain = $bindable(),
		timeSelected = $bindable(),
		onDateChange,
		disabled,
		showTimeSelector
	}: Props = $props();

	let currentDate = $derived(timeSelected);
	let currentHour = $derived(currentDate.getHours());

	const resolution = $derived(domain.time_interval);

	const previousHour = () => {
		const date = new SvelteDate(timeSelected);
		date.setHours(currentHour - resolution);
		onDateChange(date);
	};

	const nextHour = () => {
		const date = new SvelteDate(timeSelected);
		date.setHours(currentHour + resolution);
		onDateChange(date);
	};

	const previousDay = () => {
		const date = new SvelteDate(timeSelected);
		date.setDate(date.getDate() - 1);
		date.setHours(currentHour);
		onDateChange(date);
	};

	const nextDay = () => {
		const date = new SvelteDate(timeSelected);
		date.setDate(date.getDate() + 1);
		date.setHours(currentHour);
		onDateChange(date);
	};

	const keydownEvent = (event: KeyboardEvent) => {
		if (!disabled) {
			switch (event.key) {
				case 'ArrowLeft':
					previousHour();
					break;
				case 'ArrowRight':
					nextHour();
					break;
				case 'ArrowDown':
					previousDay();
					break;
				case 'ArrowUp':
					nextDay();
					break;
			}
		} else {
			toast('Still loading another OM file');
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
	class="time-selector bg-background/90 dark:bg-background/70 absolute bottom-14.5 left-[50%] mx-auto transform-[translate(-50%)] rounded-lg px-3 py-3 {!showTimeSelector
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
			<div class="-mt-0.5 flex flex-col items-center">
				<span
					class="min-w-[150px] text-center whitespace-nowrap delay-75 duration-200 {disabled
						? ' text-black/50 dark:text-white/50 '
						: ' text-black  dark:text-white'}"
					id="slider_time_label"
					>{`${currentDate.getFullYear()}-${pad(currentDate.getMonth() + 1)}-${pad(currentDate.getDate())}T${pad(currentDate.getHours())}:00`}</span
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
			{disabled}
			step={resolution}
			value={currentHour}
			oninput={(e) => {
				const target = e.target as HTMLInputElement;
				const value = target?.value;
				let newDate = new SvelteDate(timeSelected);
				newDate.setHours(Number(value));
				currentDate = newDate;
			}}
			onchange={(e) => {
				const target = e.target as HTMLInputElement;
				const value = target?.value;
				const date = new SvelteDate(timeSelected);
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
