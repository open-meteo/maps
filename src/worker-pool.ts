import { browser } from '$app/environment';
import type { Data } from './om-protocol';
import type { Domain, Variable, DimensionRange } from '$lib/types';
import TileWorker from './worker?worker';

export interface TileRequest {
	type: 'GT';
	x: number;
	y: number;
	z: number;
	key: string;
	data: Data;
	domain: Domain;
	variable: Variable;
	ranges: DimensionRange[];
	dark: boolean;
	mapBounds: number[];
	iconPixelData: Record<string, ImageDataArray>;
}

export type TileResponse = {
	type: 'RT';
	tile: ImageBitmap;
	key: string;
};

export class WorkerPool {
	private workers: Worker[] = [];
	private nextWorker = 0;
	private pendingTiles = new Map<string, (tile: ImageBitmap) => void>();

	constructor() {
		if (browser) {
			const workerCount = navigator.hardwareConcurrency || 4;
			for (let i = 0; i < workerCount; i++) {
				const worker = new TileWorker();
				worker.onmessage = (message) => this.handleMessage(message);
				this.workers.push(worker);
			}
		}
	}

	private handleMessage(message: MessageEvent): void {
		const data = message.data as TileResponse;
		if (data.type === 'RT') {
			const resolve = this.pendingTiles.get(data.key);
			if (resolve) {
				resolve(data.tile);
				this.pendingTiles.delete(data.key);
			} else {
				console.error(`Unexpected tile response for ${data.key}`);
			}
		}
	}

	public getNextWorker(): Worker | undefined {
		if (this.workers.length === 0) return undefined;

		const worker = this.workers[this.nextWorker];
		this.nextWorker = (this.nextWorker + 1) % this.workers.length;
		return worker;
	}

	public requestTile(request: TileRequest): Promise<ImageBitmap> {
		const worker = this.getNextWorker();
		if (!worker) {
			return Promise.reject(new Error('No workers available (likely running in SSR)'));
		}

		worker.postMessage(request);
		return new Promise<ImageBitmap>((resolve) => {
			this.pendingTiles.set(request.key, resolve);
		});
	}
}
