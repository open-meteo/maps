<script lang="ts">
	import { SvelteDate } from 'svelte/reactivity';

	import { pad } from '$lib/utils/pad';

	import type { Domain } from '$lib/types';
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	interface Props {
		domain: Domain;
		timeSelected: Date;
		onDateChange: (e: Event | null, date?: Date) => void;
		disabled: boolean;
	}

	let {
		domain = $bindable(),
		timeSelected = $bindable(),
		onDateChange,
		disabled
	}: Props = $props();

	let currentDate = $derived(timeSelected);
	let currentHour = $derived(currentDate.getHours());

	const resolution = $derived(domain.time_interval);

	const formatSliderLabel = (date: Date) => {
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00`;
	};

	const formatDateInputValue = (date: Date) => {
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	};

	const keydownEvent = (event: KeyboardEvent) => {
		if (!disabled) {
			const d = new SvelteDate(timeSelected);
			switch (event.key) {
				case 'ArrowLeft':
					d.setHours(currentHour - resolution);
					onDateChange(null, d);
					break;
				case 'ArrowRight':
					d.setHours(currentHour + resolution);
					onDateChange(null, d);
					break;
				case 'ArrowUp':
					d.setDate(d.getDate() + 1);
					d.setHours(currentHour);
					onDateChange(null, d);
					break;
				case 'ArrowDown':
					d.setDate(d.getDate() - 1);
					d.setHours(currentHour);
					onDateChange(null, d);
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

<div>
	<div class="flex flex-col {disabled ? 'cursor-not-allowed' : ''}">
		<div style="display:flex; gap: 0.5em; justify-items: center; align-items: center;">
			<button
				id="prev_hour"
				class="rounded border bg-white px-2.5 py-2 duration-200 dark:bg-[#646464cc] {disabled
					? 'border-foreground/50  text-black/50 dark:text-white/50 '
					: ' border-foreground/75 text-black  dark:text-white'}"
				type="button"
				aria-label="Previous hour"
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
			<span
				class="min-w-[155px] text-center whitespace-nowrap duration-200 {disabled
					? ' text-black/50 dark:text-white/50 '
					: ' text-black  dark:text-white'}"
				id="slider_time_label">{formatSliderLabel(currentDate)}</span
			>
			<button
				id="next_hour"
				class="rounded border bg-white px-2.5 py-2 duration-200 dark:bg-[#646464cc] {disabled
					? 'border-foreground/50  text-black/50 dark:text-white/50 '
					: ' border-foreground/75 text-black  dark:text-white'}"
				type="button"
				aria-label="Next hour"
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
			class="w-full"
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
			onchange={(e) => onDateChange(e)}
		/>
		<input
			type="date"
			id="date_picker"
			class="date-time-selection {disabled
				? 'border-foreground/50  text-black/50 dark:text-white/50 '
				: ' border-foreground/75 text-black  dark:text-white'}"
			{disabled}
			value={formatDateInputValue(currentDate)}
			oninput={(e) => onDateChange(e)}
		/>
	</div>
</div>
