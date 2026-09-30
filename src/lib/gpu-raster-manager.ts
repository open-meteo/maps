/**
 * GpuRasterManager: the GPU replacement for the FrameManager's raster
 * channels. Each chart source that draws a raster gets one persistent
 * `WeatherGpuLayer` (a tile-free MapLibre custom layer rendering the field
 * per pixel in a shader); showing a new render state diffs against the
 * existing slots:
 *
 * - URL change (timestep scrub): `prepareUrl` — the layer keeps showing the
 *   old data until the new timestep is loaded; all changed slots then commit
 *   together (through the render state's CommitBarrier, which also covers the
 *   CPU vector frame), each cross-fading to the new data in-layer.
 * - Opacity / anchor changes: uniform updates, no reload.
 * - Sources appearing/disappearing: layers fade in / out at that same commit.
 *
 * Contours, arrows and grid points stay on the CPU tile pipeline via the
 * FrameManager, and so do rasters the GPU layer cannot draw (see layers.ts).
 */
import { WeatherGpuLayer, updateCurrentBounds } from '@openmeteo/weather-map-layer';

import type { CommitBarrier } from '$lib/commit-barrier';
import type { OmProtocolSettings } from '@openmeteo/weather-map-layer';
import type * as maplibregl from 'maplibre-gl';

export interface GpuRasterSlotSpec {
	/** Stable slot key: the chart source's variable. */
	key: string;
	/** om:// URL of the data (identity of what is shown). */
	url: string;
	/** Layer opacity 0..1. */
	opacity: number;
	/** Layer id in the basemap style to insert before. */
	beforeLayer: string;
}

export interface GpuRasterManagerOptions {
	settings: OmProtocolSettings;
	onLoadingChange?: (loading: boolean) => void;
	/** Fired when a slot batch committed its loaded URLs (like a frame commit). */
	onShown?: () => void;
	onError?: (error: unknown) => void;
}

interface Slot {
	layer: WeatherGpuLayer;
	layerId: string;
	url: string;
	/** Target opacity (the spec's). */
	opacity: number;
	/** Opacity currently applied to the layer; differs from `opacity` mid-fade. */
	shown: number;
	beforeLayer: string;
}

/** Fade of entering and leaving slots, matching the FrameManager's cross-fade. */
const FADE_MS = 250;

export class GpuRasterManager {
	private map: maplibregl.Map;
	private opts: GpuRasterManagerOptions;
	private slots = new Map<string, Slot>();
	/** Slots taken out of `slots` whose layer still waits for its fade-out. */
	private retiring = new Set<Slot>();
	/** Running fades by slot; a newer show() snaps them to their end state. */
	private fades = new Map<Slot, { raf: number; finish: () => void }>();
	private slotOrdinal = 0;
	private pendingLoads = 0;
	private onMoveEnd: () => void;

	constructor(map: maplibregl.Map, opts: GpuRasterManagerOptions) {
		this.map = map;
		this.opts = opts;
		// Data is viewport-cropped (currentBounds): after the map settles on a new
		// view, re-resolve every slot so panning/zooming beyond the loaded crop
		// fetches the missing region — the same effect new tile requests have on
		// the CPU path. No-op when the loaded crop still covers the view.
		this.onMoveEnd = () => this.refresh();
		this.map.on('moveend', this.onMoveEnd);
	}

	/** URLs currently shown, per chart source key (for the popup). */
	getActiveUrls(): Map<string, string> {
		const urls = new Map<string, string>();
		for (const [key, slot] of this.slots) {
			if (slot.url) urls.set(key, slot.url);
		}
		return urls;
	}

	/**
	 * Reconcile the on-map layers with the requested render state. Changed URLs
	 * load in the background; their visual swaps run together when the last one
	 * (and, through `barrier`, the accompanying vector frame) is ready.
	 */
	show(specs: GpuRasterSlotSpec[], barrier?: CommitBarrier): void {
		this.syncBounds();
		this.settleFades();
		const seen = new Set<string>();
		const prepares: Promise<(() => void) | null>[] = [];
		const entering: Slot[] = [];

		for (const spec of specs) {
			seen.add(spec.key);
			let slot = this.slots.get(spec.key);
			if (!slot) {
				// The ordinal keeps ids unique while a retiring layer of the same
				// source is still fading out
				const layerId = `gpuRaster${this.slotOrdinal++}_${spec.key}`;
				// Entering layers stay invisible until the batch commit fades them in
				const layer = new WeatherGpuLayer({
					id: layerId,
					opacity: 0,
					settings: this.opts.settings
				});
				const before = this.map.getLayer(spec.beforeLayer) ? spec.beforeLayer : undefined;
				this.map.addLayer(layer, before);
				slot = {
					layer,
					layerId,
					url: '',
					opacity: spec.opacity,
					shown: 0,
					beforeLayer: spec.beforeLayer
				};
				this.slots.set(spec.key, slot);
				entering.push(slot);
			}

			if (slot.beforeLayer !== spec.beforeLayer) {
				slot.beforeLayer = spec.beforeLayer;
				if (this.map.getLayer(slot.layerId) && this.map.getLayer(spec.beforeLayer)) {
					this.map.moveLayer(slot.layerId, spec.beforeLayer);
				}
			}
			if (slot.opacity !== spec.opacity) {
				slot.opacity = spec.opacity;
				// A running fade-in reads the target live and converges on it
				if (!this.fades.has(slot)) this.setShown(slot, spec.opacity);
			}
			if (slot.url !== spec.url) {
				slot.url = spec.url;
				prepares.push(this.prepareSlot(slot, spec.url));
			}
		}

		// Slots no longer wanted leave at the batch commit, not now: until their
		// replacement (a slot of another source, or the CPU raster frame of a
		// renderer switch) is ready to show, the old raster must stay on screen.
		const leaving: Slot[] = [];
		for (const [key, slot] of [...this.slots]) {
			if (seen.has(key)) continue;
			this.slots.delete(key);
			this.retiring.add(slot);
			leaving.push(slot);
		}

		const commitBatch = (commits: (() => void)[]): void => {
			for (const commit of commits) commit();
			for (const slot of entering) this.fade(slot, () => slot.opacity);
			for (const slot of leaving)
				this.fade(
					slot,
					() => 0,
					() => this.removeSlot(slot)
				);
			this.opts.onShown?.();
		};

		if (prepares.length === 0) {
			const commit = leaving.length > 0 ? (): void => commitBatch([]) : undefined;
			if (barrier) {
				barrier.arrive(commit);
			} else {
				commit?.();
			}
			return;
		}

		this.pendingLoads++;
		this.opts.onLoadingChange?.(true);
		void Promise.all(prepares)
			.then((commits) => {
				// Superseded loads resolve null (per-slot URL check + the layer's own
				// load sequence), so stale commits are already no-ops.
				const valid = commits.filter((commit): commit is () => void => commit !== null);
				const commit =
					valid.length > 0 || leaving.length > 0 ? (): void => commitBatch(valid) : undefined;
				if (barrier) {
					barrier.arrive(commit);
				} else {
					commit?.();
				}
			})
			.finally(() => {
				this.pendingLoads--;
				if (this.pendingLoads === 0) this.opts.onLoadingChange?.(false);
			});
	}

	/** Ease the layer from its shown opacity to `target` (read live), then `done`. */
	private fade(slot: Slot, target: () => number, done?: () => void): void {
		const running = this.fades.get(slot);
		if (running) cancelAnimationFrame(running.raf);
		const from = slot.shown;
		const start = performance.now();
		const finish = (): void => {
			this.fades.delete(slot);
			this.setShown(slot, target());
			done?.();
		};
		const step = (now: number): void => {
			const t = Math.min(1, (now - start) / FADE_MS);
			if (t >= 1) {
				finish();
				return;
			}
			const e = t * t * (3 - 2 * t); // smoothstep
			this.setShown(slot, from + (target() - from) * e);
			this.fades.set(slot, { raf: requestAnimationFrame(step), finish });
		};
		this.fades.set(slot, { raf: requestAnimationFrame(step), finish });
	}

	/** Snap every running fade to its end state (a newer show supersedes it). */
	private settleFades(): void {
		for (const [, fade] of [...this.fades]) {
			cancelAnimationFrame(fade.raf);
			fade.finish();
		}
	}

	private setShown(slot: Slot, opacity: number): void {
		slot.shown = opacity;
		slot.layer.setOpacity(opacity);
	}

	private removeSlot(slot: Slot): void {
		this.retiring.delete(slot);
		if (this.map.getLayer(slot.layerId)) this.map.removeLayer(slot.layerId);
	}

	/**
	 * The protocol's viewport crop (`currentBounds`) updates on the map's
	 * `dataloading` event — which barely fires on the tile-free GPU path (not
	 * at all with a warm basemap cache), leaving requests parsed against a
	 * stale viewport. Sync it from the map whenever we are about to build URLs.
	 */
	private syncBounds(): void {
		const bounds = this.map.getBounds();
		updateCurrentBounds([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]);
	}

	/** Re-resolve every slot's URL against the current viewport crop. */
	refresh(): void {
		this.syncBounds();
		for (const slot of this.slots.values()) {
			if (!slot.url) continue;
			slot.layer.setUrl(slot.url).catch(() => {
				// A refresh failure keeps showing the previous crop; the visible
				// error path is the initial load in prepareSlot().
			});
		}
	}

	/** Move slots anchored at `from` to `to` (hillshade toggle re-anchor). */
	reanchor(from: string, to: string): void {
		for (const slot of this.slots.values()) {
			if (slot.beforeLayer !== from) continue;
			slot.beforeLayer = to;
			if (this.map.getLayer(slot.layerId) && this.map.getLayer(to)) {
				this.map.moveLayer(slot.layerId, to);
			}
		}
	}

	/**
	 * Replace the protocol settings on every layer (current and future). The
	 * settings store swaps its object on changes (clipping, colour scales); the
	 * CPU protocol reads it live per request, and the GPU layers must follow
	 * the same object or they keep parsing against a stale snapshot.
	 */
	updateSettings(settings: OmProtocolSettings): void {
		if (settings === this.opts.settings) return;
		this.opts.settings = settings;
		for (const slot of this.slots.values()) slot.layer.setSettings(settings);
	}

	destroy(): void {
		this.settleFades();
		this.map.off('moveend', this.onMoveEnd);
		for (const slot of [...this.slots.values(), ...this.retiring]) this.removeSlot(slot);
		this.slots.clear();
	}

	private prepareSlot(slot: Slot, url: string): Promise<(() => void) | null> {
		return slot.layer
			.prepareUrl(url)
			.then((commit) => (slot.url === url ? commit : null))
			.catch((error) => {
				if (slot.url === url) this.opts.onError?.(error);
				return null;
			});
	}
}
