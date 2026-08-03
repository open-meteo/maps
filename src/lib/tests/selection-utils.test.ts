import { describe, expect, it } from 'vitest';

import {
	buildLevelGroups,
	firstPopularTarget,
	resolvePopularTarget
} from '$lib/components/selection/selection-utils';

import { popularVariables } from '$lib/chart-presets';

// Real variable lists served by the domains' meta.json
const ecmwfWamVariables = ['wave_direction', 'wave_height', 'wave_peak_period', 'wave_period'];
const meteofranceWaveVariables = [
	'secondary_swell_wave_direction',
	'secondary_swell_wave_height',
	'secondary_swell_wave_period',
	'swell_wave_direction',
	'swell_wave_height',
	'swell_wave_period',
	'wave_direction',
	'wave_height',
	'wave_period',
	'wind_wave_direction',
	'wind_wave_height',
	'wind_wave_period'
];
const weatherVariables = [
	'cape',
	'precipitation',
	'pressure_msl',
	'temperature_2m',
	'temperature_850hPa',
	'wind_u_component_10m',
	'wind_v_component_10m'
];

describe('resolvePopularTarget', () => {
	it('shows the waves preset on marine domains', () => {
		const entry = popularVariables.find(({ presetId }) => presetId === 'waves');
		expect(entry).toBeDefined();
		for (const metaVariables of [ecmwfWamVariables, meteofranceWaveVariables]) {
			const resolved = resolvePopularTarget(entry!, metaVariables, buildLevelGroups(metaVariables));
			expect(resolved).toEqual({ presetId: 'waves' });
		}
	});

	it('does not resolve the wind level group from wind_wave_* variables', () => {
		const entry = popularVariables.find(({ id }) => id === 'wind');
		const resolved = resolvePopularTarget(
			entry!,
			meteofranceWaveVariables,
			buildLevelGroups(meteofranceWaveVariables)
		);
		expect(resolved).toBeUndefined();
	});
});

describe('firstPopularTarget', () => {
	it('falls back to the waves preset on marine domains', () => {
		expect(firstPopularTarget(ecmwfWamVariables)).toEqual({ presetId: 'waves' });
		expect(firstPopularTarget(meteofranceWaveVariables)).toEqual({ presetId: 'waves' });
	});

	it('falls back to 2 m temperature on weather domains', () => {
		expect(firstPopularTarget(weatherVariables)).toEqual({ variable: 'temperature_2m' });
	});

	it('is undefined when the domain serves no popular entry', () => {
		expect(firstPopularTarget(['ozone_mass_mixing_ratio'])).toBeUndefined();
	});
});
