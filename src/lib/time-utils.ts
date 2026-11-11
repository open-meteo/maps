import { SvelteDate } from 'svelte/reactivity';

/**
 * Finds the closest timestep that is less than or equal to the given date
 * @param date - The target date to find a timestep for
 * @param timeSteps - Array of available timesteps (sorted chronologically)
 * @returns The closest timestep or undefined if none found
 */
export const findTimeStep = (
	date: Date | SvelteDate,
	timeSteps: Date[] | SvelteDate[] | undefined
): Date | SvelteDate | undefined => {
	if (!timeSteps || timeSteps.length === 0) {
		return undefined;
	}

	const targetTime = date.getTime();
	return timeSteps.reduce((closest, current) => {
		const closestDelta = Math.abs(closest.getTime() - targetTime);
		const currentDelta = Math.abs(current.getTime() - targetTime);
		return currentDelta < closestDelta ? current : closest;
	});
};

/**
 * The same local time of day `months` months before `date`, on the last day
 * of the month when the day does not exist there (31 March, 1 month: 28 or
 * 29 February rather than the early March that Date.setMonth would give).
 */
export const monthsBefore = (date: Date, months: number): Date => {
	const result = new Date(date);
	result.setDate(1);
	result.setMonth(result.getMonth() - months);
	const daysInMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
	result.setDate(Math.min(date.getDate(), daysInMonth));
	return result;
};
