<script lang="ts">
	import { SvelteDate } from 'svelte/reactivity';

	import { pad } from '$lib/utils/pad';

	import type { Domain } from '$lib/types';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	interface Props {
		domain: Domain;
		timeSelected: Date;
	}

	let {
		domain = $bindable(),
		timeSelected = $bindable(),
		onDateChange,
		disabled
	}: Props = $props();

	const getLocalMidnight = (date: Date) => {
		const d = new SvelteDate(date);
		d.setHours(0, 0, 0, 0);
		return d;
	};

	let currentDate = $state(new Date(timeSelected));
	let currentHour = $derived(currentDate.getHours());

	const resolution = $derived(domain.time_interval);

	function formatSliderLabel(date: Date) {
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00`;
	}

	function formatDateInputValue(date: Date) {
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	}

	onMount(() => {
		if (browser) {
			window.addEventListener('keydown', (event) => {
				let newDate;
				switch (event.key) {
					case 'ArrowLeft':
						// prevBtn.click();
						break;
					case 'ArrowRight':
						// nextBtn.click();
						break;
					case 'ArrowUp':
						currentDate.setDate(currentDate.getDate() + 1);
						newDate = new Date(currentDate);
						newDate.setHours(currentHour);
						// onChange(newDate);
						break;
					case 'ArrowDown':
						currentDate.setDate(currentDate.getDate() - 1);
						newDate = new Date(currentDate);
						newDate.setHours(currentHour);
						// onChange(newDate);
						break;
				}
			});
		}
	});
</script>

<div>
	<div class="flex flex-col">
		<div style="display:flex; gap: 0.5em; justify-items: center; align-items: center;">
			<button
				id="prev_hour"
				class="border-accent rounded border bg-white px-3 py-1 text-lg font-bold text-black dark:bg-[#646464cc] dark:text-white"
				type="button">&lt;</button
			>
			<span class="min-w-[155px] text-center whitespace-nowrap" id="slider_time_label"
				>{formatSliderLabel(currentDate)}</span
			>
			<button
				id="next_hour"
				class="border-accent rounded border bg-white px-3 py-1 text-lg font-bold text-black dark:bg-[#646464cc] dark:text-white"
				type="button">&gt;</button
			>
		</div>
		<input
			id="time_slider"
			class="w-full"
			type="range"
			min="0"
			max="24"
			step={resolution}
			value={currentHour}
			oninput={(e) => {
				const value = e.target?.value;
				let newDate = new SvelteDate(timeSelected);
				newDate.setHours(value);
				currentDate = newDate;
			}}
			onchange={(e) => onDateChange(e)}
		/>
		<input
			type="date"
			id="date_picker"
			class="date-time-selection"
			value={formatDateInputValue(currentDate)}
			oninput={(e) => onDateChange(e)}
		/>
	</div>
</div>
