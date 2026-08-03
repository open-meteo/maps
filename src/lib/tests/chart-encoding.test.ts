import { describe, expect, it } from 'vitest';

import {
	isPlainChart,
	matchPreset,
	parseSources,
	serializeSources,
	sourcesEqual,
	variableSupportsArrows
} from '$lib/chart-encoding';
import { chartPresets } from '$lib/chart-presets';

import type { ChartSource } from '$lib/chart-types';

describe('serializeSources / parseSources', () => {
	it('round-trips a multi-source chart', () => {
		const sources: ChartSource[] = [
			{ variable: 'temperature_850hPa', raster: true, contours: true, contourInterval: 2 },
			{ variable: 'geopotential_height_500hPa', contours: true, contourInterval: 4 },
			{ variable: 'wind_u_component_10m', arrows: true }
		];

		const raw = serializeSources(sources);
		expect(raw).toBe('temperature_850hPa:rc2,geopotential_height_500hPa:c4,wind_u_component_10m:a');
		expect(parseSources(raw)).toEqual(sources);
	});

	it('serializes a raster-only source without flags', () => {
		expect(serializeSources([{ variable: 'temperature_2m', raster: true }])).toBe('temperature_2m');
	});

	it('parses a bare variable as raster-only', () => {
		expect(parseSources('temperature_2m')).toEqual([{ variable: 'temperature_2m', raster: true }]);
	});

	it('parses contours without an interval (breakpoints mode)', () => {
		expect(parseSources('pressure_msl:rc')).toEqual([
			{ variable: 'pressure_msl', raster: true, contours: true }
		]);
	});

	it('parses fractional contour intervals', () => {
		const parsed = parseSources('pressure_msl:c2.5');
		expect(parsed).toEqual([{ variable: 'pressure_msl', contours: true, contourInterval: 2.5 }]);
		expect(serializeSources(parsed!)).toBe('pressure_msl:c2.5');
	});

	it('round-trips every preset, styling included, so it re-matches its preset', () => {
		for (const preset of chartPresets) {
			const parsed = parseSources(serializeSources(preset.sources));
			expect(parsed, preset.id).toBeDefined();
			expect(sourcesEqual(parsed!, preset.sources), preset.id).toBe(true);
			expect(matchPreset(parsed!)?.id, preset.id).toBe(preset.id);
		}
	});

	it('round-trips opacity, line width and inline vectors', () => {
		const sources: ChartSource[] = [
			{
				variable: 'wind_u_component_10m',
				raster: true,
				arrows: true,
				inlineVectors: true,
				opacity: 0.7
			},
			{ variable: 'cloud_cover', raster: true, opacity: 0.7 },
			{ variable: 'pressure_msl', contours: true, contourInterval: 2, lineWidth: 0.8 }
		];

		const raw = serializeSources(sources);
		expect(raw).toBe('wind_u_component_10m:raio0.7,cloud_cover:ro0.7,pressure_msl:c2w0.8');
		expect(parseSources(raw)).toEqual(sources);
	});

	it('merges duplicate variables', () => {
		expect(parseSources('pressure_msl:r,pressure_msl:c5')).toEqual([
			{ variable: 'pressure_msl', raster: true, contours: true, contourInterval: 5 }
		]);
	});

	it('rejects malformed tokens', () => {
		expect(parseSources('temperature_2m:x')).toBeUndefined();
		expect(parseSources('temp erature')).toBeUndefined();
		expect(parseSources('')).toBeUndefined();
	});

	it('rejects charts that render nothing', () => {
		expect(parseSources('temperature_2m:')).toBeUndefined();
	});
});

describe('matchPreset', () => {
	it('recognizes an exact preset composition', () => {
		const preset = chartPresets.find((p) => p.id === 'z500_t850')!;
		expect(matchPreset(preset.sources.map((s) => ({ ...s })))?.id).toBe('z500_t850');
	});

	it('does not match modified compositions', () => {
		const preset = chartPresets.find((p) => p.id === 'z500_t850')!;
		const modified = preset.sources.map((s) => ({ ...s }));
		modified[1].contourInterval = 3;
		expect(matchPreset(modified)).toBeUndefined();
	});
});

describe('isPlainChart', () => {
	it('accepts a single raster source', () => {
		expect(isPlainChart({ sources: [{ variable: 'temperature_2m', raster: true }] })).toBe(true);
	});

	it('rejects contour-only and multi-source charts', () => {
		expect(isPlainChart({ sources: [{ variable: 'pressure_msl', contours: true }] })).toBe(false);
		expect(
			isPlainChart({
				sources: [
					{ variable: 'temperature_2m', raster: true },
					{ variable: 'pressure_msl', contours: true }
				]
			})
		).toBe(false);
	});
});

describe('variableSupportsArrows', () => {
	it('matches derivable direction variables', () => {
		expect(variableSupportsArrows('wind_u_component_10m')).toBe(true);
		expect(variableSupportsArrows('wind_v_component_850hPa')).toBe(true);
		expect(variableSupportsArrows('ocean_u_current_velocity')).toBe(true);
		expect(variableSupportsArrows('wind_speed_10m')).toBe(true);
		expect(variableSupportsArrows('wave_height')).toBe(true);
	});

	it('rejects scalar variables', () => {
		expect(variableSupportsArrows('temperature_2m')).toBe(false);
		expect(variableSupportsArrows('pressure_msl')).toBe(false);
		expect(variableSupportsArrows('wind_gusts_10m')).toBe(false);
	});
});
