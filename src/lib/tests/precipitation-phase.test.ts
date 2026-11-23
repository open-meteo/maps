import { GridFactory } from '@openmeteo/weather-map-layer';
import { describe, expect, it } from 'vitest';

import {
	UNKNOWN_PHASE_COLOR,
	classifyPhase,
	decodeTerrarium,
	demTileRegion,
	latitudeAt,
	longitudeAt,
	markUnknownPhase,
	phaseInterpolation,
	precipitationInterval,
	tilePoint
} from '#lib/precipitation-phase/model.js';
import { PHASE_CONTOUR_HALO, tracePhaseBoundary } from '#lib/precipitation-phase/phase-contour.js';
import { weatherRanges } from '#lib/precipitation-phase/protocol.js';
import { phaseTileHalo, shadeSnow } from '#lib/precipitation-phase/snow-pattern.js';

describe('terrain precipitation phase', () => {
	it('compares sea-level heights and leaves missing heights unclassified', () => {
		expect(classifyPhase(800, 1200)).toBe('rain');
		expect(classifyPhase(1200, 1200)).toBe('snow');
		expect(classifyPhase(1400, 1200)).toBe('snow');
		expect(classifyPhase(1400, NaN)).toBe('unknown');
		expect(classifyPhase(NaN, 1200)).toBe('unknown');
	});

	it('keeps known precipitation colors and marks unknown phase in gray at the same opacity', () => {
		const pixels = new Uint8ClampedArray([20, 50, 220, 150, 20, 50, 220, 200, 0, 0, 0, 0]);
		markUnknownPhase(pixels, new Uint8Array([1, 1, 0]), (index) => index === 0);
		expect(Array.from(pixels)).toEqual([20, 50, 220, 150, ...UNKNOWN_PHASE_COLOR, 200, 0, 0, 0, 0]);
	});

	it('accepts each map interpolation mode and defaults to linear', () => {
		for (const method of ['linear', 'nearest', 'cubic', 'monotone']) {
			expect(phaseInterpolation(method)).toBe(method);
		}
		expect(phaseInterpolation(null)).toBe('linear');
		expect(phaseInterpolation('unsupported')).toBe('linear');
	});

	it.each(['nearest', 'linear', 'cubic', 'monotone'] as const)(
		'samples %s from a small picker window at and between grid nodes',
		(method) => {
			const grid = { type: 'regular', nx: 40, ny: 40, lonMin: 0, latMin: 0, dx: 1, dy: 1 } as const;
			const values = Float32Array.from({ length: grid.nx * grid.ny }, (_, i) => Math.sin(i / 15));
			for (const [lon, lat] of [
				[10, 15],
				[10.25, 15.75]
			]) {
				const ranges = weatherRanges(grid, [lon, lat, lon, lat], method);
				const [rows, cols] = ranges;
				const slice = values.filter((_, i) => {
					const y = Math.floor(i / grid.nx);
					const x = i % grid.nx;
					return y >= rows.start && y < rows.end && x >= cols.start && x < cols.end;
				});
				expect(slice.length).toBeLessThanOrEqual(36);
				const expected = GridFactory.create(grid).getInterpolatedValue(values, lat, lon, method);
				expect(GridFactory.create(grid, ranges).getInterpolatedValue(slice, lat, lon, method)).toBe(
					expected
				);
			}
		}
	);

	it('decodes fractional and below-sea-level elevations', () => {
		expect(decodeTerrarium(128, 10, 128)).toBe(10.5);
		expect(decodeTerrarium(127, 255, 0)).toBe(-1);
	});

	it('uses the accumulation period independently of the NBM timestep spacing', () => {
		expect(precipitationInterval('ncep_nbm_conus', 36, 1)).toBe(1);
		expect(precipitationInterval('ncep_nbm_conus', 42, 3)).toBe(6);
		expect(precipitationInterval('other', 42, 3)).toBe(3);
	});

	it('aligns geographic samples with the overzoomed terrain tile', () => {
		const { tile, u, v } = tilePoint(46.7, 368.1, 21);
		expect(tile.z).toBe(18);
		const dem = demTileRegion(tile);
		expect(dem.tile.z).toBe(12);
		expect(latitudeAt(dem.tile.y + (dem.offsetY + v) / dem.scale, dem.tile.z)).toBeCloseTo(46.7);
		expect(longitudeAt(dem.tile.x + (dem.offsetX + u) / dem.scale, dem.tile.z)).toBeCloseTo(8.1);
		expect(latitudeAt(tile.y + v, tile.z)).toBeCloseTo(46.7);
		expect(longitudeAt(tile.x + u, tile.z)).toBeCloseTo(8.1);
	});
	it('draws diagonal white hatching only within snow', () => {
		const size = 32;
		const colors = new Uint8ClampedArray(size * size * 4).fill(123);
		shadeSnow(colors, size, 8, (x) => x >= 8);
		const pixel = (x: number, y: number) =>
			Array.from(colors.slice((y * size + x) * 4, (y * size + x + 1) * 4));
		expect(pixel(8, 8)[0]).toBeGreaterThan(245);
		expect(pixel(9, 7)).toEqual(pixel(8, 8));
		expect(pixel(11, 7)).toEqual(pixel(8, 8));
		expect(pixel(12, 7)[0]).toBeLessThan(123);
		expect(pixel(13, 7)).toEqual([119, 136, 152, 152]);
		expect(pixel(7, 9)).toEqual([123, 123, 123, 123]);
		expect(pixel(31, 1)).toEqual(pixel(8, 8));
	});

	it('uses a tint for short regional patches and keeps long stripes visible over trace snow', () => {
		const size = 64;
		const colors = new Uint8ClampedArray(size * size * 4);
		shadeSnow(
			colors,
			size,
			5,
			(x, y) => (x >= 32 && x <= 60) || (x >= 13 && x <= 16 && y >= 16 && y <= 20)
		);
		const pixel = (x: number, y: number) =>
			Array.from(colors.slice((y * size + x) * 4, (y * size + x + 1) * 4));
		expect(pixel(16, 16)).toEqual([113, 159, 202, 112]);
		expect(pixel(48, 16)[0]).toBeGreaterThan(245);
		expect(pixel(49, 16)).toEqual(pixel(48, 16));
		expect(pixel(32, 16)).toEqual([113, 159, 202, 112]);
		expect(pixel(20, 12)).toEqual([0, 0, 0, 0]);
		expect(phaseTileHalo(5, true, true)).toBe(8);
		expect(phaseTileHalo(8, true, true)).toBe(PHASE_CONTOUR_HALO);
	});

	it('interpolates a boundary across tile padding and skips gaps in wet data', () => {
		const size = 2;
		const halo = phaseTileHalo(5, true, true);
		const stride = size + 2 * halo;
		const values = Float32Array.from(
			{ length: stride ** 2 },
			(_, index) => (index % stride) - halo + 0.5
		);
		const vertices: number[][] = [];
		const path = {
			moveTo: (x: number, y: number) => vertices.push([x, y]),
			lineTo: (x: number, y: number) => vertices.push([x, y])
		};
		tracePhaseBoundary(values, size, path, halo);
		expect(vertices).toHaveLength(2 * (stride - 1));
		expect(vertices.every(([x]) => x === 0)).toBe(true);
		expect(vertices.map(([, y]) => y)).toContain(-0.5);
		expect(vertices.map(([, y]) => y)).toContain(size + 0.5);

		vertices.length = 0;
		values.fill(NaN, stride, 2 * stride);
		tracePhaseBoundary(values, size, path, halo);
		expect(vertices).toHaveLength(2 * (stride - 3));
	});

	it('connects opposite edges on either side of a saddle without branching', () => {
		const stride = 1 + 2 * PHASE_CONTOUR_HALO;
		const values = new Float32Array(stride ** 2).fill(NaN);
		values[0] = values[stride + 1] = 2;
		values[1] = values[stride] = -1;
		const vertices: number[][] = [];
		tracePhaseBoundary(values, 1, {
			moveTo: (x, y) => vertices.push([x, y]),
			lineTo: (x, y) => vertices.push([x, y])
		});
		expect(vertices).toEqual([
			[-1.5 + 2 / 3, -1.5],
			[-0.5, -1.5 + 1 / 3],
			[-1.5 + 1 / 3, -0.5],
			[-1.5, -1.5 + 2 / 3]
		]);
	});
});
