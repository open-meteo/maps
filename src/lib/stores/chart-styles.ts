import { writable } from 'svelte/store';

import type { ArrowStyle, ContourStyle } from '$lib/chart-styles';

/** Custom contour styles keyed by variable name. Overrides defaultContourStyle. */
export const customContourStyles = writable<Record<string, ContourStyle>>({});

/** Custom arrow styles keyed by variable name. Overrides defaultArrowStyle. */
export const customArrowStyles = writable<Record<string, ArrowStyle>>({});
