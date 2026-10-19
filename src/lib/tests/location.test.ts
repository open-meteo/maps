import { describe, expect, it } from 'vitest';

import { formatCoordinates, parseCoordinates } from '#lib/stores/location.js';

describe('parseCoordinates', () => {
	it('accepts numbers and numeric strings', () => {
		expect(parseCoordinates(52.52, 13.41)).toEqual({ latitude: 52.52, longitude: 13.41 });
		expect(parseCoordinates('52.52', '-13.41')).toEqual({ latitude: 52.52, longitude: -13.41 });
		expect(parseCoordinates('-90', '180')).toEqual({ latitude: -90, longitude: 180 });
	});

	it('rejects values outside the coordinate ranges', () => {
		expect(parseCoordinates(90.1, 0)).toBeUndefined();
		expect(parseCoordinates(0, -180.1)).toBeUndefined();
	});

	it('rejects missing, empty and non-numeric values', () => {
		expect(parseCoordinates(null, 13.41)).toBeUndefined();
		expect(parseCoordinates('52.52', undefined)).toBeUndefined();
		expect(parseCoordinates('', '')).toBeUndefined();
		expect(parseCoordinates('abc', '13')).toBeUndefined();
		expect(parseCoordinates(true, false)).toBeUndefined();
		expect(parseCoordinates(NaN, 0)).toBeUndefined();
	});
});

describe('formatCoordinates', () => {
	it('names the hemispheres', () => {
		expect(formatCoordinates({ latitude: 52.52437, longitude: 13.41053 })).toBe('52.52°N 13.41°E');
		expect(formatCoordinates({ latitude: -33.8688, longitude: -70.6693 })).toBe('33.87°S 70.67°W');
	});
});
