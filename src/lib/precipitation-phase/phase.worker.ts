import { GridFactory, createClippingTester, getColor } from '@openmeteo/weather-map-layer';

import {
	PHASE_TILE_SIZE,
	UNKNOWN_PHASE_COLOR,
	classifyPhase,
	decodeTerrarium,
	demTileRegion,
	latitudeAt,
	longitudeAt,
	mapterhornTileUrl
} from './model';
import { PHASE_CONTOUR_COLOR, PHASE_CONTOUR_HALO_COLOR, tracePhaseBoundary } from './phase-contour';
import { phaseTileHalo, shadeSnow } from './snow-pattern';

import type { PhasePoint, Tile } from './model';
import type { PhaseJob, PhaseMessage, PhaseResult } from './worker-types';

const worker = globalThis as unknown as {
	onmessage: (event: MessageEvent<PhaseMessage>) => void;
	postMessage: (message: PhaseResult, transfer?: Transferable[]) => void;
};
const demTiles = new Map<string, Promise<ImageData | undefined>>();

const loadDem = async (tile: Tile) => {
	try {
		const response = await fetch(mapterhornTileUrl(tile), {
			signal: AbortSignal.timeout(8000)
		});
		if (!response.ok) return undefined;
		const bitmap = await createImageBitmap(await response.blob(), {
			colorSpaceConversion: 'none',
			premultiplyAlpha: 'none'
		});
		try {
			const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
			const context = canvas.getContext('2d')!;
			context.drawImage(bitmap, 0, 0);
			return context.getImageData(0, 0, bitmap.width, bitmap.height);
		} finally {
			bitmap.close();
		}
	} catch {
		return undefined;
	}
};

const demSampler = async (weatherTile: Tile) => {
	const { tile, scale, offsetX, offsetY } = demTileRegion(weatherTile);
	const key = `${tile.z}/${tile.x}/${tile.y}`;
	const pending = demTiles.get(key) ?? loadDem(tile);
	demTiles.delete(key);
	demTiles.set(key, pending);
	if (demTiles.size > 64) demTiles.delete(demTiles.keys().next().value!);
	const image = await pending;
	if (!image) {
		if (demTiles.get(key) === pending) demTiles.delete(key);
		return () => NaN;
	}
	return (u: number, v: number) => {
		const x = Math.min(image.width - 1, Math.floor(((offsetX + u) * image.width) / scale));
		const y = Math.min(image.height - 1, Math.floor(((offsetY + v) * image.height) / scale));
		const index = (y * image.width + x) * 4;
		if (image.data[index + 3] === 0) return NaN;
		return decodeTerrarium(image.data[index], image.data[index + 1], image.data[index + 2]);
	};
};

/** Pixel coordinates may include samples in the neighboring tiles. */
const demAcrossTile = async (tile: Tile, size: number, needed: number) => {
	const world = 2 ** tile.z;
	const samplers = await Promise.all(
		Array.from({ length: 9 }, (_, index) => {
			if (!(needed & (1 << index))) return undefined;
			const y = tile.y + Math.floor(index / 3) - 1;
			const x = (tile.x + (index % 3) - 1 + world) % world;
			return y >= 0 && y < world ? demSampler({ z: tile.z, x, y }) : undefined;
		})
	);
	return (col: number, row: number) => {
		const dx = Math.floor(col / size);
		const dy = Math.floor(row / size);
		const sample = samplers[(dy + 1) * 3 + dx + 1];
		return sample?.((col - dx * size + 0.5) / size, (row - dy * size + 0.5) / size) ?? NaN;
	};
};

const render = async (
	{
		tile,
		weather,
		clipping,
		point,
		colorScale,
		colorBlend,
		interpolation,
		fill,
		contours
	}: PhaseJob,
	signal: AbortSignal
) => {
	const { x, y, z } = tile;
	const { rates, heights, domain, ranges } = weather;
	if (point) {
		const grid = GridFactory.create(domain.grid, ranges);
		const elevationAt = await demSampler(tile);
		return {
			rate: rates ? grid.getInterpolatedValue(rates, point.lat, point.lon, interpolation) : NaN,
			height: heights
				? grid.getInterpolatedValue(heights, point.lat, point.lon, interpolation)
				: NaN,
			elevation: elevationAt(point.u, point.v)
		} satisfies PhasePoint;
	}

	const size = PHASE_TILE_SIZE;
	const canvas = new OffscreenCanvas(size, size);
	const context = canvas.getContext('2d')!;
	if (!rates) return canvas.transferToImageBitmap();
	const transparentZero = !fill || getColor(colorScale, 0, colorBlend)[3] === 0;
	if (transparentZero && !rates.some((value) => value !== 0 && Number.isFinite(value))) {
		return canvas.transferToImageBitmap();
	}
	const grid = GridFactory.create(domain.grid, ranges);
	const inside = createClippingTester(clipping);
	const rgba = fill ? new ImageData(size, size) : undefined;
	const colorOut: [number, number, number, number] = [0, 0, 0, 0];
	const halo = phaseTileHalo(z, fill, contours);
	const stride = size + 2 * halo;
	const snowlines = new Float32Array(stride * stride).fill(NaN);
	const indexAt = (col: number, row: number) => (row + halo) * stride + col + halo;
	const lons = Float64Array.from({ length: stride }, (_, col) =>
		longitudeAt(x + (col - halo + 0.5) / size, z)
	);
	// One bit for each DEM tile in the 3×3 neighborhood covered by the halo.
	let neededDemTiles = 0;
	for (let row = -halo; row < size + halo; row++) {
		const lat = latitudeAt(y + (row + 0.5) / size, z);
		const demRow = 3 * (1 + Math.floor(row / size));
		for (let col = -halo; col < size + halo; col++) {
			const lon = lons[col + halo];
			if (inside && !inside(lon, lat)) continue;
			const rate = grid.getInterpolatedValue(rates, lat, lon, interpolation);
			if (!Number.isFinite(rate) || (rate === 0 && transparentZero)) continue;
			if (rate > 0 && heights) {
				const height = grid.getInterpolatedValue(heights, lat, lon, interpolation);
				if (Number.isFinite(height)) {
					snowlines[indexAt(col, row)] = height;
					neededDemTiles |= 1 << (demRow + 1 + Math.floor(col / size));
				}
			}
			if (rgba && col >= 0 && col < size && row >= 0 && row < size) {
				const [red, green, blue, alpha] = getColor(colorScale, rate, colorBlend, colorOut);
				if (!alpha) continue;
				const offset = (row * size + col) * 4;
				rgba.data[offset] = red;
				rgba.data[offset + 1] = green;
				rgba.data[offset + 2] = blue;
				rgba.data[offset + 3] = alpha * 255;
				if (rate > 0 && !Number.isFinite(snowlines[indexAt(col, row)])) {
					rgba.data.set(UNKNOWN_PHASE_COLOR, offset);
				}
			}
		}
	}
	let differences: Float32Array | undefined;
	if (neededDemTiles) {
		const elevationAt = await demAcrossTile(tile, size, neededDemTiles);
		signal.throwIfAborted();
		differences = snowlines;
		for (let row = -halo; row < size + halo; row++) {
			for (let col = -halo; col < size + halo; col++) {
				const index = indexAt(col, row);
				const height = snowlines[index];
				if (!Number.isFinite(height)) continue;
				const elevation = elevationAt(col, row);
				differences[index] = elevation - height;
				if (
					!Number.isFinite(elevation) &&
					rgba &&
					col >= 0 &&
					col < size &&
					row >= 0 &&
					row < size
				) {
					const offset = (row * size + col) * 4;
					if (rgba.data[offset + 3]) rgba.data.set(UNKNOWN_PHASE_COLOR, offset);
				}
			}
		}
	}
	if (rgba) {
		const phaseDifference = differences;
		if (phaseDifference) {
			shadeSnow(rgba.data, size, z, (col, row) =>
				classifyPhase(phaseDifference[indexAt(col, row)])
			);
		}
		context.putImageData(rgba, 0, 0);
	}
	if (contours && differences) {
		const boundary = new Path2D();
		tracePhaseBoundary(differences, size, boundary, halo);
		context.lineCap = 'round';
		context.lineWidth = z <= 6 ? 2.6 : 3.2;
		context.strokeStyle = PHASE_CONTOUR_HALO_COLOR;
		context.stroke(boundary);
		context.lineWidth = z <= 6 ? 1.1 : 1.35;
		context.strokeStyle = PHASE_CONTOUR_COLOR;
		context.stroke(boundary);
	}

	return canvas.transferToImageBitmap();
};

const active = new Map<number, AbortController>();
worker.onmessage = async ({ data: message }: MessageEvent<PhaseMessage>) => {
	if ('cancel' in message) {
		active.get(message.cancel)?.abort();
		return;
	}
	const { id } = message;
	const controller = new AbortController();
	active.set(id, controller);
	try {
		const result = await render(message, controller.signal);
		if (controller.signal.aborted) {
			if (result instanceof ImageBitmap) result.close();
			return;
		}
		const response: PhaseResult = { id, data: result };
		worker.postMessage(response, result instanceof ImageBitmap ? [result] : []);
	} catch (error) {
		if (!controller.signal.aborted) {
			const response: PhaseResult = { id, error: String(error) };
			worker.postMessage(response);
		}
	} finally {
		active.delete(id);
	}
};
