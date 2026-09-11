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
	it('falls back to wave height on marine domains', () => {
		expect(firstPopularTarget(ecmwfWamVariables)).toEqual({ variable: 'wave_height' });
		expect(firstPopularTarget(meteofranceWaveVariables)).toEqual({ variable: 'wave_height' });
	});

	it('falls back to precipitation probability on ensemble domains', () => {
		expect(firstPopularTarget(['precipitation_probability'])).toEqual({
			variable: 'precipitation_probability'
		});
	});

	it('falls back to PM2.5 on air-quality domains', () => {
		expect(firstPopularTarget(['nitrogen_dioxide', 'ozone', 'pm10', 'pm2_5'])).toEqual({
			variable: 'pm2_5'
		});
	});

	it('falls back to 2 m temperature on weather domains', () => {
		expect(firstPopularTarget(weatherVariables)).toEqual({ variable: 'temperature_2m' });
	});

	it('is undefined when the domain serves no popular entry', () => {
		expect(firstPopularTarget(['ozone_mass_mixing_ratio'])).toBeUndefined();
	});
});
