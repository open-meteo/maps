import { pad } from '$lib/utils/pad';
import { toast } from 'svelte-sonner';

export type TimeSliderOptions = {
	container: HTMLElement;
	initialDate: Date;
	onChange: (date: Date) => void;
	resolution?: number;
};

function pad2(n: number) {
	return n < 10 ? '0' + n : n;
}

function getLocalMidnight(date: Date) {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d;
}

function formatSliderLabel(date: Date, hour: number) {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(hour)}:00`;
}

function formatDateInputValue(date: Date) {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export class TimeSlider {
	constructor(container, initialDate, onChange) {}
}

export function createTimeSlider({
	container,
	initialDate,
	onChange,
	resolution = 1
}: TimeSliderOptions) {
	let currentDate = getLocalMidnight(initialDate);
	let currentHour = initialDate.getHours();

	container.innerHTML = `
		<div style="display:flex; gap: 0.5em; justify-items: center; align-items: center;">
			<button id="prev_hour" type="button">&lt;</button>
			<span style="white-space:nowrap;" id="slider_time_label">${formatSliderLabel(currentDate, currentHour)}</span>
			<button id="next_hour" type="button">&gt;</button>
		</div>
		<input
			type="range"
			id="time_slider"
			min="0"
			max="23"
			step="${resolution}"
			value="${currentHour}"
			style="width: 200px;"
		/>
		<input
			type="date"
			id="date_picker"
			class="date-time-selection"
			min=${initialDate.getFullYear() + '-' + pad(initialDate.getMonth() + 1) + '-' + pad(initialDate.getDate())}
			value="${formatDateInputValue(currentDate)}"
		/>
	`;

	const timeSlider = container.querySelector('#time_slider') as HTMLInputElement;
	const prevBtn = container.querySelector('#prev_hour') as HTMLButtonElement;
	const nextBtn = container.querySelector('#next_hour') as HTMLButtonElement;
	const dateInput = container.querySelector('#date_picker') as HTMLInputElement;
	const sliderLabel = container.querySelector('#slider_time_label') as HTMLElement;

	function updateUI() {
		sliderLabel.textContent = formatSliderLabel(currentDate, currentHour);
		timeSlider.value = String(currentHour);
		dateInput.value = formatDateInputValue(currentDate);
	}

	timeSlider.addEventListener('input', (e) => {
		currentHour = Number((e.target as HTMLInputElement).value);
		updateUI();
	});
	timeSlider.addEventListener('change', () => {
		const newDate = new Date(currentDate);
		newDate.setHours(currentHour);
		onChange(newDate);
	});

	prevBtn.addEventListener('click', () => {
		if (currentHour > resolution - 1) {
			currentHour -= resolution;
		} else {
			currentHour = 23;
			currentDate.setDate(currentDate.getDate() - 1);
		}
		updateUI();
		const newDate = new Date(currentDate);
		newDate.setHours(currentHour);
		onChange(newDate);
	});

	nextBtn.addEventListener('click', () => {
		if (currentHour < 23 - resolution) {
			currentHour += resolution;
		} else {
			currentHour = 0;
			currentDate.setDate(currentDate.getDate() + 1);
		}
		updateUI();
		const newDate = new Date(currentDate);
		newDate.setHours(currentHour);
		onChange(newDate);
	});

	dateInput.addEventListener('change', (e) => {
		const val = (e.target as HTMLInputElement).value;
		const [year, month, day] = val.split('-').map(Number);
		currentDate = new Date(Date.UTC(year, month - 1, day));
		updateUI();
		const newDate = new Date(currentDate);
		newDate.setHours(currentHour);
		onChange(newDate);
	});

	// Provide a method to enable/disable all controls
	function setDisabled(disabled: boolean) {
		timeSlider.disabled = disabled;
		prevBtn.disabled = disabled;
		nextBtn.disabled = disabled;
		dateInput.disabled = disabled;
	}

	window.addEventListener('keydown', (event) => {
		let newDate;
		switch (event.key) {
			case 'ArrowLeft':
				prevBtn.click();
				break;
			case 'ArrowRight':
				nextBtn.click();
				break;
			case 'ArrowUp':
				currentDate.setDate(currentDate.getDate() + 1);
				updateUI();
				newDate = new Date(currentDate);
				newDate.setHours(currentHour);
				onChange(newDate);
				break;
			case 'ArrowDown':
				currentDate.setDate(currentDate.getDate() - 1);
				updateUI();
				newDate = new Date(currentDate);
				newDate.setHours(currentHour);
				onChange(newDate);
				break;
		}
	});

	// Return the API which supports enabling/disabling controls
	return { setDisabled };
}
