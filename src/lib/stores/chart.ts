import { writable } from 'svelte/store';

import type { ChartSource } from '$lib/chart-presets';

/**
 * When set, the map renders multiple sources simultaneously instead of a single
 * variable. Each entry describes one source layer (variable + render modes).
 * `undefined` means normal single-variable mode.
 */
export const activeChartSources = writable<ChartSource[] | undefined>(undefined);
