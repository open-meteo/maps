import * as maplibregl from 'maplibre-gl';

import type { CommitBarrier } from '$lib/commit-barrier';

/**
 * FrameManager: cross-fading orchestrator for a stack of MapLibre weather
 * layers (adapted from the drizzli FrameAnimator).
 *
 * A **frame** is one complete visual state of the weather overlay, composed
 * of one or more **channels** (e.g. a temperature raster fill, a pressure
 * contour vector source, wind arrows). Each channel owns a source and its
 * layers. A frame is *ready* only when every channel's source has loaded, so
 * multi-variable charts always appear in one visual step, and it is shown by
 * fading all its layers in together while the previous frame fades out.
 *
 * Replaces the A/B SlotManager: instead of two slots per source, frames are
 * keyed by their full render state (channel keys + source URLs). Recently
 * shown frames stay resident in a small LRU so switching back (e.g. time
 * scrubbing to the previous step) is instant. After fading out, a retained
 * frame's layers are set to `visibility: none` — a zero-opacity layer would
 * still trigger tile loads on pan/zoom.
 */

export interface ChannelLayerDef {
	/** Base layer id — suffixed per frame for uniqueness. */
	id: string;
	/** Paint property used to fade this layer, e.g. `raster-opacity`. */
	opacityProp: string;
	/** Target opacity when the frame is shown. */
	peakOpacity: number;
	/** Layer id in the basemap style to insert before. */
	beforeLayer?: string;
	/** Add the layer at opacity 0 (it is faded in on commit). */
	add: (map: maplibregl.Map, sourceId: string, layerId: string, beforeLayer?: string) => void;
}

export interface FrameChannel {
	/** Stable channel key, e.g. `temperature_2m:raster`. */
	key: string;
	/** om:// source URL (also the identity of the channel's data). */
	url: string;
	sourceSpec: maplibregl.SourceSpecification;
	layers: ChannelLayerDef[];
}

export interface FrameManagerOptions {
	/** Cross-fade duration in ms. Default 250. */
	crossFadeMs?: number;
	/** Retained non-visible frames beyond the current one. Default 3. */
	retainMax?: number;
	/**
	 * Ground-truth data availability per channel url (from the om protocol).
	 * MapLibre counts failed tiles as complete, so tile state alone cannot
	 * distinguish "everything rendered" from "everything failed".
	 */
	getChannelDataState?: (url: string) => 'loaded' | 'loading' | 'error' | 'missing';
	onLoadingChange?: (loading: boolean) => void;
	/** Fired when a frame becomes visible. */
	onCommit?: () => void;
	/** Fired when loading a pending frame failed. */
	onError?: () => void;
	slowLoadWarningMs?: number;
	onSlowLoad?: () => void;
}

interface FrameLayer {
	layerId: string;
	opacityProp: string;
	peak: number;
	beforeLayer?: string;
}

/** Contour/arrow/label/grid layers, as opposed to raster fills. */
const isLineLayer = (layer: FrameLayer): boolean => layer.opacityProp !== 'raster-opacity';

interface Frame {
	key: string;
	channels: FrameChannel[];
	sourceIds: string[];
	layers: FrameLayer[];
	onData?: () => void;
	/** A source of this frame failed; it must not commit (retried on re-show). */
	errored?: boolean;
}

export class FrameManager {
	private map: maplibregl.Map;
	private opts: FrameManagerOptions;

	private frames = new Map<string, Frame>();
	private lru: string[] = [];
	private currentKey: string | null = null;
	private pendingKey: string | null = null;
	/** Barrier of the pending (or barrier-held) frame; arrives exactly once. */
	private pendingBarrier: { barrier: CommitBarrier; arrived: boolean } | undefined;
	private frameOrdinal = 0;
	private slowLoadTimer: ReturnType<typeof setTimeout> | undefined;
	private dissolve?: { raf: number; newRasters: FrameLayer[]; oldRasters: FrameLayer[] };
	/** Frame whose commit waits for the running dissolve to finish. */
	private queuedCommit?: Frame;
	private hideTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private onMapError: (e: maplibregl.MapSourceDataEvent) => void;

	constructor(map: maplibregl.Map, opts: FrameManagerOptions = {}) {
		this.map = map;
		this.opts = opts;
		this.onMapError = (e) => {
			// Only errors attributable to one of our own sources fail a frame.
			// Source-less errors (basemap tiles, terrain, glyphs) must not
			// cancel a pending weather switch; om data-load failures surface
			// through getChannelDataState and om tile errors carry a sourceId.
			if (!e.sourceId) return;
			const frame = [...this.frames.values()].find((f) =>
				f.sourceIds.includes(e.sourceId as string)
			);
			if (!frame) return;
			frame.errored = true;

			if (this.pendingKey === frame.key) {
				this.failPending(frame);
			}
		};
		this.map.on('error', this.onMapError);
	}

	/** Channels of the currently visible frame (e.g. for the popup). */
	getActiveChannels(): FrameChannel[] {
		return this.currentFrame()?.channels ?? [];
	}

	/**
	 * Re-point every resident layer anchored at `from` to `to`. Insertion
	 * points are recorded at frame build time, so when the surrounding basemap
	 * stack changes without a style reload (the hillshade toggle), existing
	 * frames must be moved rather than rebuilt — a pure z-order change should
	 * not cost a cross-fade.
	 */
	reanchor(from: string, to: string): void {
		for (const frame of this.frames.values()) {
			for (const layer of frame.layers) {
				if (layer.beforeLayer !== from) continue;
				layer.beforeLayer = to;
				if (this.map.getLayer(layer.layerId) && this.map.getLayer(to)) {
					this.map.moveLayer(layer.layerId, to);
				}
			}
		}
	}

	/**
	 * Show the frame described by `channels`, building it when needed. The
	 * previous frame stays visible until every channel of the new frame has
	 * loaded, then both cross-fade. With a `barrier` the commit additionally
	 * waits for the other render paths of the same render state (GPU raster
	 * slots), so all layers start animating together.
	 */
	show(channels: FrameChannel[], barrier?: CommitBarrier): void {
		const key = channels.map((channel) => `${channel.key}@${channel.url}`).join(';');

		if (this.currentKey === key) {
			this.abandonPending();
			barrier?.arrive();
			return;
		}
		if (this.pendingKey === key) {
			// The same frame is already loading for a superseded render state;
			// release that state's barrier and adopt the new one.
			this.arrivePending();
			this.pendingBarrier = barrier ? { barrier, arrived: false } : undefined;
			return;
		}

		this.abandonPending();

		let frame = this.frames.get(key);
		if (!frame) {
			frame = this.buildFrame(key, channels);
		} else {
			this.cancelHide(key);
			// A previously failed frame gets another chance
			frame.errored = false;
			this.setFrameVisibility(frame, true);
			this.raiseFrame(frame);
		}
		this.touchLru(key);

		if (this.isFrameLoaded(frame)) {
			if (barrier) {
				// Loaded, but held for the barrier: stays pending so a newer show()
				// supersedes it cleanly.
				this.pendingKey = key;
				this.pendingBarrier = { barrier, arrived: false };
				this.arrivePending(() => {
					if (this.pendingKey === key) this.commit(frame);
				});
			} else {
				this.commit(frame);
			}
		} else {
			this.pendingKey = key;
			this.pendingBarrier = barrier ? { barrier, arrived: false } : undefined;
			this.setLoading(true);
			this.watchFrame(frame);
			this.startSlowLoadTimer();
		}
	}

	/** Remove every frame (also used before/after a basemap style reload). */
	reset(): void {
		if (this.dissolve) {
			cancelAnimationFrame(this.dissolve.raf);
			this.dissolve = undefined;
		}
		this.queuedCommit = undefined;
		this.abandonPending();
		for (const key of [...this.frames.keys()]) this.removeFrame(key);
		this.currentKey = null;
		this.lru = [];
	}

	destroy(): void {
		this.reset();
		this.map.off('error', this.onMapError);
	}

	// ── internals ─────────────────────────────────────────────────────────

	private currentFrame(): Frame | undefined {
		return this.currentKey ? this.frames.get(this.currentKey) : undefined;
	}

	private pendingFrame(): Frame | undefined {
		return this.pendingKey ? this.frames.get(this.pendingKey) : undefined;
	}

	private setLoading(loading: boolean): void {
		this.opts.onLoadingChange?.(loading);
	}

	private buildFrame(key: string, channels: FrameChannel[]): Frame {
		const ordinal = this.frameOrdinal++;
		const sourceIds: string[] = [];
		const layers: FrameLayer[] = [];

		for (const channel of channels) {
			const sourceId = `omFrame${ordinal}_${channel.key}`;
			this.map.addSource(sourceId, channel.sourceSpec);
			sourceIds.push(sourceId);

			for (const layerDef of channel.layers) {
				const layerId = `${sourceId}_${layerDef.id}`;
				layerDef.add(this.map, sourceId, layerId, layerDef.beforeLayer);
				if (this.map.getLayer(layerId)) {
					layers.push({
						layerId,
						opacityProp: layerDef.opacityProp,
						peak: layerDef.peakOpacity,
						beforeLayer: layerDef.beforeLayer
					});
				}
			}
		}

		const frame: Frame = { key, channels, sourceIds, layers };
		this.frames.set(key, frame);
		return frame;
	}

	/** Move the frame's layers to the top of their respective om stacks. */
	private raiseFrame(frame: Frame): void {
		for (const { layerId, beforeLayer } of frame.layers) {
			if (!this.map.getLayer(layerId)) continue;
			// A missing anchor would raise the layer to the very top (above
			// labels) and fire an error event; leaving it in place is safer.
			if (beforeLayer && !this.map.getLayer(beforeLayer)) continue;
			this.map.moveLayer(layerId, beforeLayer);
		}
	}

	/** The underlying variable data of every channel has loaded. */
	private frameDataState(frame: Frame): 'loaded' | 'loading' | 'error' {
		const getState = this.opts.getChannelDataState;
		if (!getState) return 'loaded';
		let result: 'loaded' | 'loading' = 'loaded';
		for (const channel of frame.channels) {
			const state = getState(channel.url);
			if (state === 'error') return 'error';
			if (state !== 'loaded') result = 'loading';
		}
		return result;
	}

	private isFrameLoaded(frame: Frame): boolean {
		// Source.loaded() only covers the source metadata (TileJSON); the map
		// must additionally have all requested tiles AND the protocol must
		// hold actual data for every channel. Failed tiles count as
		// "complete" in areTilesLoaded(), so without the data check an empty
		// frame would commit and fade the previous data out. Errored frames
		// never commit.
		return (
			!frame.errored &&
			this.frameDataState(frame) === 'loaded' &&
			frame.sourceIds.every((id) => this.map.getSource(id)?.loaded()) &&
			this.map.areTilesLoaded()
		);
	}

	/** Release the pending frame's barrier (once); without a commit on failure. */
	private arrivePending(commit?: () => void): void {
		const held = this.pendingBarrier;
		if (!held || held.arrived) return;
		held.arrived = true;
		held.barrier.arrive(commit);
	}

	/** Fail the pending switch: keep showing the previous frame. */
	private failPending(frame: Frame): void {
		this.arrivePending();
		this.pendingBarrier = undefined;
		this.unwatchFrame(frame);
		this.removeFrame(frame.key);
		this.pendingKey = null;
		this.queuedCommit = undefined;
		this.clearSlowLoadTimer();
		this.setLoading(false);
		this.opts.onError?.();
	}

	/** Re-check on sourcedata and idle until every tile of the frame loaded. */
	private watchFrame(frame: Frame): void {
		if (frame.onData) return;
		const check = (): void => {
			if (this.pendingKey !== frame.key) {
				this.unwatchFrame(frame);
				return;
			}
			if (frame.errored || this.frameDataState(frame) === 'error') {
				this.failPending(frame);
				return;
			}
			if (this.isFrameLoaded(frame)) {
				this.unwatchFrame(frame);
				if (this.pendingBarrier) {
					this.arrivePending(() => {
						if (this.pendingKey === frame.key) this.commit(frame);
					});
				} else {
					this.commit(frame);
				}
			}
		};
		frame.onData = check;
		this.map.on('sourcedata', check);
		this.map.on('idle', check);
	}

	private unwatchFrame(frame: Frame): void {
		if (!frame.onData) return;
		this.map.off('sourcedata', frame.onData);
		this.map.off('idle', frame.onData);
		frame.onData = undefined;
	}

	private commit(frame: Frame): void {
		// Never interrupt a running dissolve (snapping it mid-way is a visible
		// jump). The commit waits for it — at most crossFadeMs — and chains.
		// pendingKey must cover the wait: commits arriving via the
		// already-loaded show() path have not set it, and runQueuedCommit
		// discards a queued frame that is no longer the pending one.
		if (this.dissolve) {
			this.queuedCommit = frame;
			this.pendingKey = frame.key;
			return;
		}
		this.queuedCommit = undefined;
		this.pendingKey = null;
		this.pendingBarrier = undefined;
		this.clearSlowLoadTimer();

		const previous = this.currentFrame();
		this.currentKey = frame.key;
		this.cancelHide(frame.key);

		const duration = this.opts.crossFadeMs ?? 250;
		// Timestep switches reuse the same layer layout with new data. A plain
		// simultaneous cross-fade of two translucent rasters dips their
		// combined alpha mid-fade (the basemap flashes through between
		// near-identical images), so their fills get an opacity-compensated
		// dissolve instead. Layout changes (variable/chart switches) keep the
		// plain cross-fade.
		const sameLayout =
			previous !== undefined &&
			previous.key !== frame.key &&
			this.channelSignature(previous) === this.channelSignature(frame);

		if (sameLayout && previous) {
			// Lines cross-fade (holding both fully visible would double them)
			this.setFrameOpacity(frame, 1, duration, isLineLayer);
			this.setFrameOpacity(previous, 0, duration, isLineLayer);
			this.dissolveRasters(frame, previous, duration);
			this.scheduleHide(previous.key);
		} else {
			this.setFrameOpacity(frame, 1, duration);
			if (previous && previous.key !== frame.key) {
				this.setFrameOpacity(previous, 0, duration);
				this.scheduleHide(previous.key);
			}
		}

		this.evict();
		this.setLoading(false);
		this.opts.onCommit?.();
	}

	/**
	 * Dissolve the raster fills of two same-layout frames with constant
	 * combined coverage: the new fill fades in on top while the old one
	 * underneath follows the compensation curve b = p(1-e) / (1 - p*e), so
	 * the basemap never shines through and the fills never over-darken.
	 * Needs rAF driving — paint transitions cannot express the curve.
	 */
	private dissolveRasters(newFrame: Frame, oldFrame: Frame, duration: number): void {
		const newRasters = newFrame.layers.filter((layer) => !isLineLayer(layer));
		const oldRasters = oldFrame.layers.filter((layer) => !isLineLayer(layer));

		// Direct per-frame updates; the declarative transition must not smooth them
		for (const layer of [...newRasters, ...oldRasters]) {
			if (this.map.getLayer(layer.layerId)) {
				this.map.setPaintProperty(layer.layerId, layer.opacityProp + '-transition', {
					duration: 0,
					delay: 0
				});
			}
		}

		const setOpacity = (layer: FrameLayer, value: number): void => {
			if (this.map.getLayer(layer.layerId)) {
				this.map.setPaintProperty(layer.layerId, layer.opacityProp, value);
			}
		};

		const start = performance.now();
		const step = (now: number): void => {
			const t = Math.min((now - start) / duration, 1);
			const e = t * t * (3 - 2 * t); // smoothstep
			for (const layer of newRasters) setOpacity(layer, layer.peak * e);
			for (const layer of oldRasters) {
				const denominator = 1 - layer.peak * e;
				setOpacity(
					layer,
					t >= 1 || denominator <= 0.001 ? 0 : (layer.peak * (1 - e)) / denominator
				);
			}
			if (t < 1) {
				this.dissolve = { raf: requestAnimationFrame(step), newRasters, oldRasters };
			} else {
				this.dissolve = undefined;
				this.runQueuedCommit();
			}
		};
		this.dissolve = { raf: requestAnimationFrame(step), newRasters, oldRasters };
	}

	private runQueuedCommit(): void {
		const queued = this.queuedCommit;
		this.queuedCommit = undefined;
		// Only when no newer show() superseded it in the meantime
		if (queued && this.pendingKey === queued.key && this.frames.has(queued.key)) {
			this.commit(queued);
		}
	}

	private abandonPending(): void {
		this.arrivePending();
		this.pendingBarrier = undefined;
		this.queuedCommit = undefined;
		if (!this.pendingKey) return;
		const pending = this.pendingFrame();
		if (pending) this.unwatchFrame(pending);
		// Keep the partially loaded frame resident; it may be shown later
		this.scheduleHide(this.pendingKey);
		this.pendingKey = null;
		this.clearSlowLoadTimer();
		this.setLoading(false);
	}

	private setFrameOpacity(
		frame: Frame,
		mul: number,
		durationMs?: number,
		filter?: (layer: FrameLayer) => boolean
	): void {
		for (const layer of frame.layers) {
			if (filter && !filter(layer)) continue;
			if (!this.map.getLayer(layer.layerId)) continue;
			if (durationMs !== undefined) {
				this.map.setPaintProperty(layer.layerId, layer.opacityProp + '-transition', {
					duration: durationMs,
					delay: 0
				});
			}
			this.map.setPaintProperty(layer.layerId, layer.opacityProp, layer.peak * mul);
		}
	}

	/** Layer layout identity: channel keys without the (time-dependent) URLs. */
	private channelSignature(frame: Frame): string {
		return frame.channels.map((channel) => channel.key).join('|');
	}

	private setFrameVisibility(frame: Frame, visible: boolean): void {
		for (const { layerId } of frame.layers) {
			if (this.map.getLayer(layerId)) {
				this.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
			}
		}
		if (visible) this.setFrameOpacity(frame, 0);
	}

	/** After the fade-out, hide the frame's layers to stop background tile loads. */
	private scheduleHide(key: string): void {
		this.cancelHide(key);
		const delay = (this.opts.crossFadeMs ?? 250) + 100;
		this.hideTimers.set(
			key,
			setTimeout(() => {
				this.hideTimers.delete(key);
				if (key === this.currentKey || key === this.pendingKey) return;
				const frame = this.frames.get(key);
				if (frame) this.setFrameVisibility(frame, false);
			}, delay)
		);
	}

	private cancelHide(key: string): void {
		const timer = this.hideTimers.get(key);
		if (timer !== undefined) {
			clearTimeout(timer);
			this.hideTimers.delete(key);
		}
	}

	private touchLru(key: string): void {
		const at = this.lru.indexOf(key);
		if (at >= 0) this.lru.splice(at, 1);
		this.lru.push(key);
	}

	private evict(): void {
		const retainMax = this.opts.retainMax ?? 3;
		// Current frame is always retained on top of the cap
		const removable = this.lru.filter((key) => key !== this.currentKey && key !== this.pendingKey);
		while (removable.length > retainMax) {
			const key = removable.shift();
			if (key !== undefined) this.removeFrame(key);
		}
	}

	private removeFrame(key: string): void {
		const frame = this.frames.get(key);
		if (!frame) return;
		this.unwatchFrame(frame);
		this.cancelHide(key);
		for (const { layerId } of frame.layers) {
			if (this.map.getLayer(layerId)) this.map.removeLayer(layerId);
		}
		for (const sourceId of frame.sourceIds) {
			if (this.map.getSource(sourceId)) this.map.removeSource(sourceId);
		}
		this.frames.delete(key);
		const at = this.lru.indexOf(key);
		if (at >= 0) this.lru.splice(at, 1);
		if (this.currentKey === key) this.currentKey = null;
		if (this.pendingKey === key) this.pendingKey = null;
	}

	private startSlowLoadTimer(): void {
		this.clearSlowLoadTimer();
		if (!this.opts.slowLoadWarningMs || !this.opts.onSlowLoad) return;
		this.slowLoadTimer = setTimeout(this.opts.onSlowLoad, this.opts.slowLoadWarningMs);
	}

	private clearSlowLoadTimer(): void {
		if (this.slowLoadTimer !== undefined) {
			clearTimeout(this.slowLoadTimer);
			this.slowLoadTimer = undefined;
		}
	}
}
