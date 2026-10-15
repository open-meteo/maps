import { get } from 'svelte/store';

import { describe, expect, it, vi } from 'vitest';

import { metaJson } from '#lib/stores/time.js';
import { availableVariables } from '#lib/stores/variables.js';

import type { DomainMetaDataJson } from '@openmeteo/weather-map-layer';

vi.mock('$app/env', () => ({ browser: false }));

const meta = (variables: string[]): DomainMetaDataJson => ({
	completed: true,
	last_modified_time: '',
	reference_time: '2026-10-15T00:00Z',
	valid_times: ['2026-10-15T00:00Z'],
	variables
});

describe('availableVariables', () => {
	it('is undefined without metadata', () => {
		metaJson.set(undefined);
		expect(get(availableVariables)).toBeUndefined();
	});

	it('adds what the derivation rules read from the stored variables', () => {
		metaJson.set(
			meta(['temperature_2m', 'relative_humidity_2m', 'precipitation', 'snowfall_water_equivalent'])
		);
		const available = get(availableVariables) ?? [];
		for (const stored of ['temperature_2m', 'snowfall_water_equivalent']) {
			expect(available).toContain(stored);
		}
		for (const derived of [
			'snowfall',
			'dew_point_2m',
			'vapour_pressure_deficit',
			'wet_bulb_temperature_2m',
			'precipitation_rate'
		]) {
			expect(available).toContain(derived);
		}
		// Needs the 10 m wind as well
		expect(available).not.toContain('apparent_temperature');
		expect(available).not.toContain('rain_rate');
	});

	it('does not list a stored variable twice', () => {
		metaJson.set(meta(['snowfall', 'snowfall_water_equivalent']));
		const available = get(availableVariables) ?? [];
		expect(available.filter((v) => v === 'snowfall')).toHaveLength(1);
	});
});
