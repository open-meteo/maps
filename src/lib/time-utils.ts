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
	return timeSteps?.findLast((tS) => tS.getTime() <= date.getTime());
};
