import { get } from 'svelte/store';

import { describe, expect, it, vi } from 'vitest';

import { activeChart, setPlainVariable, setSources } from '#lib/stores/chart.js';
import { metaJson } from '#lib/stores/time.js';
import { availableVariables, domain } from '#lib/stores/variables.js';

import { setRunMetadata } from '#lib/metadata.js';
import { RAIN_SNOW } from '#lib/precipitation-phase/model.js';

import type { DomainMetaDataJson } from '@openmeteo/weather-map-layer';

vi.mock('$app/env', () => ({ browser: false }));
vi.mock('#lib/url.js', () => ({ updateUrl: vi.fn() }));

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
			'wet_bulb_temperature_2m'
		]) {
			expect(available).toContain(derived);
		}
		// Needs the 10 m wind as well
		expect(available).not.toContain('apparent_temperature');
	});

	it('offers the phase chart only when a concrete run stores both inputs', () => {
		const previousDomain = get(domain);
		try {
			domain.set('meteoswiss_icon_ch1');
			metaJson.set(meta(['precipitation', 'freezing_level_height']));
			expect(get(availableVariables)).not.toContain(RAIN_SNOW);
			metaJson.set(meta(['precipitation', 'snowfall_height']));
			expect(get(availableVariables)).toContain(RAIN_SNOW);
			domain.set('dwd_icon_seamless');
			expect(get(availableVariables)).not.toContain(RAIN_SNOW);
		} finally {
			domain.set(previousDomain);
			metaJson.set(undefined);
		}
	});

	it('reconciles a phase chart when a selected run loses its snowfall height', () => {
		const previousDomain = get(domain);
		const previousChart = get(activeChart);
		try {
			domain.set('meteoswiss_icon_ch1');
			setPlainVariable(RAIN_SNOW);
			setRunMetadata(meta(['precipitation', 'snowfall_height', 'temperature_2m']));
			expect(get(activeChart).sources[0].variable).toBe(RAIN_SNOW);

			const withoutHeight = meta(['precipitation_probability', 'precipitation', 'temperature_2m']);
			setRunMetadata(withoutHeight);
			expect(get(activeChart).sources[0].variable).toBe('precipitation');

			setSources([
				{ variable: RAIN_SNOW, raster: true },
				{ variable: 'temperature_2m', raster: true }
			]);
			setRunMetadata(withoutHeight);
			expect(get(activeChart).sources.map((source) => source.variable)).toEqual(['temperature_2m']);
		} finally {
			domain.set(previousDomain);
			activeChart.set(previousChart);
			metaJson.set(undefined);
		}
	});

	it('does not list a stored variable twice', () => {
		metaJson.set(meta(['snowfall', 'snowfall_water_equivalent']));
		const available = get(availableVariables) ?? [];
		expect(available.filter((v) => v === 'snowfall')).toHaveLength(1);
	});
});
