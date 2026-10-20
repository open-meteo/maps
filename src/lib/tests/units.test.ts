import { describe, expect, it } from 'vitest';

import { convertValue, getDisplayUnit } from '#lib/stores/units.js';

const metric = { temperature: '°C', precipitation: 'mm', windSpeed: 'm/s', distance: 'm' } as const;
const imperial = { ...metric, precipitation: 'inch' } as const;

describe('precipitation-like units', () => {
	it('keeps mm, mm/h and cm as they are under the metric preference', () => {
		for (const unit of ['mm', 'mm/h', 'cm', 'cm/h']) {
			expect(convertValue(25.4, unit, metric)).toBe(25.4);
			expect(getDisplayUnit(unit, metric)).toBe(unit);
		}
	});

	it('converts each from its own base under the inch preference', () => {
		expect(convertValue(25.4, 'mm', imperial)).toBeCloseTo(1);
		expect(getDisplayUnit('mm', imperial)).toBe('inch');
		expect(convertValue(25.4, 'mm/h', imperial)).toBeCloseTo(1);
		expect(getDisplayUnit('mm/h', imperial)).toBe('inch/h');
		expect(convertValue(2.54, 'cm', imperial)).toBeCloseTo(1);
		expect(getDisplayUnit('cm', imperial)).toBe('inch');
		expect(convertValue(2.54, 'cm/h', imperial)).toBeCloseTo(1);
		expect(getDisplayUnit('cm/h', imperial)).toBe('inch/h');
	});
});
