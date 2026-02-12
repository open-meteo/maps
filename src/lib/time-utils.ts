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
