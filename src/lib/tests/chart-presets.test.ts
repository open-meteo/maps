import { describe, expect, it } from 'vitest';

import { variableSupportsArrows } from '$lib/chart-encoding';
import { chartPresets, popularVariables } from '$lib/chart-presets';

describe('chartPresets', () => {
	it('has unique ids', () => {
		const ids = chartPresets.map((preset) => preset.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('has unique variables per chart and at least one layer per source', () => {
		for (const preset of chartPresets) {
			const variables = preset.sources.map((source) => source.variable);
			expect(new Set(variables).size, preset.id).toBe(variables.length);
			expect(preset.sources.length, preset.id).toBeGreaterThan(0);
			for (const source of preset.sources) {
				expect(
					!!(source.raster || source.contours || source.arrows),
					`${preset.id}: ${source.variable}`
				).toBe(true);
			}
		}
	});

	it('only sets contour intervals on contour sources, with sane values', () => {
		for (const preset of chartPresets) {
			for (const source of preset.sources) {
				if (source.contourInterval !== undefined) {
					expect(source.contours, `${preset.id}: ${source.variable}`).toBe(true);
					expect(source.contourInterval, `${preset.id}: ${source.variable}`).toBeGreaterThan(0);
				}
			}
		}
	});

	it('only enables arrows on direction-capable variables', () => {
		for (const preset of chartPresets) {
			for (const source of preset.sources) {
				if (source.arrows) {
					expect(variableSupportsArrows(source.variable), `${preset.id}: ${source.variable}`).toBe(
						true
					);
				}
			}
		}
	});
});

describe('popularVariables', () => {
	it('has unique ids', () => {
		const ids = popularVariables.map((entry) => entry.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('sets a default level for level groups', () => {
		for (const entry of popularVariables) {
			if (entry.levelGroup) {
				expect(entry.defaultLevel, entry.id).toBeDefined();
			}
		}
	});
});
