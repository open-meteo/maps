import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

it('returns an empty bitmap when a tile has no precipitation data', async () => {
	class Bitmap {}
	class Canvas {
		hasContext = false;
		getContext() {
			this.hasContext = true;
			return {};
		}
		transferToImageBitmap() {
			if (!this.hasContext) throw new DOMException('Canvas has no context', 'InvalidStateError');
			return new Bitmap();
		}
	}
	const post = vi.fn();
	vi.stubGlobal('OffscreenCanvas', Canvas);
	vi.stubGlobal('ImageBitmap', Bitmap);
	vi.stubGlobal('postMessage', post);
	vi.stubGlobal('onmessage', undefined);
	await import('#lib/precipitation-phase/phase.worker.js');
	const handleMessage: (event: MessageEvent) => unknown = globalThis.onmessage!;
	await handleMessage(
		new MessageEvent('message', {
			data: { id: 1, tile: { x: 0, y: 0, z: 0 }, weather: {} }
		})
	);
	expect(post).toHaveBeenCalledWith({ id: 1, data: expect.any(Bitmap) }, [expect.any(Bitmap)]);
});
