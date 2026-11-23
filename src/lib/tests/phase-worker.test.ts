import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { UNKNOWN_PHASE_COLOR } from '#lib/precipitation-phase/model.js';

class Bitmap {}
let pixels: Uint8ClampedArray | undefined;
const fetchDem = vi.fn(async () => ({ ok: false }));
const post = vi.fn();
let handleMessage: (event: MessageEvent) => unknown;

beforeEach(async () => {
	pixels = undefined;
	vi.clearAllMocks();
	vi.resetModules();
	class Canvas {
		hasContext = false;
		getContext() {
			this.hasContext = true;
			return {
				putImageData(image: ImageData) {
					pixels = image.data;
				}
			};
		}
		transferToImageBitmap() {
			if (!this.hasContext) throw new DOMException('Canvas has no context', 'InvalidStateError');
			return new Bitmap();
		}
	}
	vi.stubGlobal('OffscreenCanvas', Canvas);
	vi.stubGlobal(
		'ImageData',
		class {
			data: Uint8ClampedArray;
			constructor(width: number, height: number) {
				this.data = new Uint8ClampedArray(width * height * 4);
			}
		}
	);
	vi.stubGlobal('ImageBitmap', Bitmap);
	vi.stubGlobal('postMessage', post);
	vi.stubGlobal('fetch', fetchDem);
	vi.stubGlobal('onmessage', undefined);
	await import('#lib/precipitation-phase/phase.worker.js');
	handleMessage = globalThis.onmessage!;
});
afterEach(() => vi.unstubAllGlobals());

const grid = { type: 'regular', nx: 50, ny: 40, lonMin: -2, latMin: 35, dx: 1, dy: 1 };
const render = async (rates?: Float32Array, heights?: Float32Array, zeroAlpha = 0) => {
	await handleMessage(
		new MessageEvent('message', {
			data: {
				id: 1,
				tile: { x: 4, y: 2, z: 3 },
				weather: { domain: { grid }, rates, heights },
				interpolation: 'nearest',
				fill: true,
				contours: false,
				colorScale: {
					type: 'breakpoint',
					breakpoints: [0, 1],
					colors: [
						[20, 50, 220, zeroAlpha],
						[20, 50, 220, 0.6]
					]
				}
			}
		})
	);
	expect(post).toHaveBeenCalledWith({ id: 1, data: expect.any(Bitmap) }, [expect.any(Bitmap)]);
};

it('returns an empty bitmap when a tile has no precipitation data', async () => {
	await render();
	expect(pixels).toBeUndefined();
});

it('skips dry tiles only when their zero precipitation color is transparent', async () => {
	const dry = new Float32Array(grid.nx * grid.ny);
	await render(dry);
	expect(pixels).toBeUndefined();
	await render(dry, undefined, 1);
	expect(Array.from(pixels!.slice(0, 4))).toEqual([20, 50, 220, 255]);
	expect(fetchDem).not.toHaveBeenCalled();
});

it.each([false, true])(
	'marks unknown phase and fetches only needed terrain (height available: %s)',
	async (hasHeight) => {
		const rates = new Float32Array(grid.nx * grid.ny);
		rates[20 * grid.nx + 22] = 1; // One wet cell in the interior of the tile.
		await render(rates, hasHeight ? new Float32Array(rates.length) : undefined);
		const alpha = pixels!.findIndex((value, index) => index % 4 === 3 && value !== 0);
		expect(alpha).toBeGreaterThan(0);
		expect(Array.from(pixels!.slice(alpha - 3, alpha + 1))).toEqual([...UNKNOWN_PHASE_COLOR, 153]);
		expect(fetchDem).toHaveBeenCalledTimes(hasHeight ? 1 : 0);
	}
);
