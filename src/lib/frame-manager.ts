import type OlMap from 'ol/Map';
import type Layer from 'ol/layer/Layer';
import type Source from 'ol/source/Source';
import type TileSource from 'ol/source/Tile';

/**
 * FrameManager: cross-fading orchestrator for a stack of OpenLayers weather layers
 *
 * A **frame** is one complete visual state of the weather overlay, composed
 * of one or more **channels** (e.g. a temperature raster fill, a pressure
 * contour vector source, wind arrows). Each channel owns one or more layers.
 * A frame is *ready* only when every layer's source has loaded its tiles, so
 * multi-variable charts always appear in one visual step, and it is shown by
 * fading all its layers in together while the previous frame fades out.
 *
 * Frames are keyed by their full render state (channel keys + source URLs).
 * Recently shown frames stay resident in a small LRU so switching back (e.g.
 * time scrubbing to the previous step) is instant. After fading out, a
 * retained frame's layers are made invisible — an invisible OpenLayers layer
 * loads no tiles on pan/zoom, and its source keeps its tile cache.
 */

export interface ChannelLayerDef {
	/** Base layer id; `raster` marks the fills that get the compensated dissolve. */
	id: string;
	/** Target opacity when the frame is shown. */
	peakOpacity: number;
	/** zIndex band of the layer; frames are raised within it. */
	zIndex: number;
	/** Build the layer at opacity 0 (it is faded in on commit). */
	create: () => Layer<Source>;
}

export interface FrameChannel {
	/** Stable channel key, e.g. `temperature_2m:raster`. */
	key: string;
	/** om:// source URL (also the identity of the channel's data). */
	url: string;
	layers: ChannelLayerDef[];
}

export interface FrameManagerOptions {
	/** Cross-fade duration in ms. Default 250. */
	crossFadeMs?: number;
	/** Retained non-visible frames beyond the current one. Default 3. */
	retainMax?: number;
	onLoadingChange?: (loading: boolean) => void;
	/** Fired when a frame becomes visible. */
	onCommit?: () => void;
	/** Fired when loading a pending frame failed. */
	onError?: () => void;
	slowLoadWarningMs?: number;
	onSlowLoad?: () => void;
}

interface FrameLayer {
	layer: Layer<Source>;
	peak: number;
	raster: boolean;
	zIndex: number;
	/** Last opacity written, so a tween can start from where the layer is. */
	opacity: number;
	/** Tiles requested but not yet loaded (or failed). */
	pending: number;
	/** At least one tile was requested since the layer became visible. */
	started: boolean;
}

/** Contour/arrow/grid layers, as opposed to raster fills. */
const isLineLayer = (layer: FrameLayer): boolean => !layer.raster;

interface Frame {
	key: string;
	channels: FrameChannel[];
	layers: FrameLayer[];
	onData?: () => void;
	/** Layers are invisible (set after the fade-out, see `scheduleHide`). */
	hidden?: boolean;
}

/** A running opacity tween of one layer. */
interface Tween {
	from: number;
	to: number;
	start: number;
	duration: number;
}

/** A running raster dissolve, see `dissolveRasters`. */
interface Dissolve {
	raf: number;
	/** Frame being faded in; it is already the current frame. */
	intoKey: string;
	/** Frame being faded out; re-showing it reverses the dissolve. */
	outOfKey: string;
	/** Flip the direction, returning the ms the unwind still takes. */
	reverse: () => number;
}

export class FrameManager {
	private map: OlMap;
	private opts: FrameManagerOptions;

	private frames = new Map<string, Frame>();
	private lru: string[] = [];
	private currentKey: string | null = null;
	private pendingKey: string | null = null;
	/** Raising a frame gives its layers the next ordinal within their band. */
	private raiseOrdinal = 0;
	private slowLoadTimer: ReturnType<typeof setTimeout> | undefined;
	private dissolve?: Dissolve;
	/** Frame whose commit waits for the running dissolve to finish. */
	private queuedCommit?: Frame;
	private hideTimers = new Map<string, ReturnType<typeof setTimeout>>();
	// OpenLayers has no paint transitions: the fades are driven by one rAF loop
	private tweens = new Map<FrameLayer, Tween>();
	private tweenRaf = 0;

	constructor(map: OlMap, opts: FrameManagerOptions = {}) {
		this.map = map;
		this.opts = opts;
	}

	/** Channels of the currently visible frame (e.g. for the popup). */
	getActiveChannels(): FrameChannel[] {
		return this.currentFrame()?.channels ?? [];
	}

	/**
	 * Insertion points are zIndex bands here, fixed for the map's lifetime;
	 * the MapLibre app moves layers when the basemap stack changes, this one
	 * has nothing to move.
	 */
	reanchor(_from: string, _to: string): void {}

	/**
	 * Show the frame described by `channels`, building it when needed. The
	 * previous frame stays visible until every layer of the new frame has
	 * loaded, then both cross-fade.
	 */
	show(channels: FrameChannel[]): void {
		const key = channels.map((channel) => `${channel.key}@${channel.url}`).join(';');

		if (this.currentKey === key) {
			this.abandonPending();
			return;
		}
		if (this.pendingKey === key) return;

		this.abandonPending();

		let frame = this.frames.get(key);
		if (!frame) {
			frame = this.buildFrame(key, channels);
			this.raiseFrame(frame);
		} else {
			this.cancelHide(key);
			this.setFrameVisibility(frame, true);
			// Raising the frame a running dissolve fades out would invert that
			// dissolve's stacking order, and its compensation curve with it — the
			// reversal in `commit` keeps the frame where it is.
			if (this.dissolve?.outOfKey !== key) this.raiseFrame(frame);
		}
		this.touchLru(key);

		this.pendingKey = key;
		this.setLoading(true);
		this.watchFrame(frame);
		this.startSlowLoadTimer();
		// Superseded frames stay resident, so the cap has to hold here too:
		// commit (the other eviction point) may be many switches away.
		this.evict();
		// A fully cached frame requests no tiles; the render pass settles it
		this.map.render();
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
		if (this.tweenRaf) cancelAnimationFrame(this.tweenRaf);
		this.tweens.clear();
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
		const frame: Frame = { key, channels, layers: [] };
		for (const channel of channels) {
			for (const layerDef of channel.layers) {
				const layer = layerDef.create();
				const frameLayer: FrameLayer = {
					layer,
					peak: layerDef.peakOpacity,
					raster: layerDef.id === 'raster',
					zIndex: layerDef.zIndex,
					opacity: 0,
					pending: 0,
					started: false
				};
				// Tile bookkeeping on the source: a frame is loaded once nothing is
				// pending. Aborted tiles report as errors, so an error only ends the
				// wait for that tile — the app never fails a frame over it.
				// Both sources are tile sources; the layer type only knows the base
				const source = layer.getSource() as TileSource | null;
				source?.on('tileloadstart', () => {
					frameLayer.pending++;
					frameLayer.started = true;
				});
				source?.on(['tileloadend', 'tileloaderror'], () => {
					frameLayer.pending = Math.max(0, frameLayer.pending - 1);
					frame.onData?.();
				});
				frame.layers.push(frameLayer);
				this.map.addLayer(layer);
			}
		}
		this.frames.set(key, frame);
		return frame;
	}

	/** Move the frame's layers to the top of their respective bands. */
	private raiseFrame(frame: Frame): void {
		const ordinal = ++this.raiseOrdinal;
		for (const frameLayer of frame.layers) {
			frameLayer.layer.setZIndex(frameLayer.zIndex + ordinal);
		}
	}

	private isFrameLoaded(frame: Frame): boolean {
		// Every layer has to be visible with all of its tiles in; a layer that
		// has not requested anything yet is still waiting for its render pass.
		return !frame.hidden && frame.layers.every((layer) => layer.started && layer.pending === 0);
	}

	/** Re-check on every tile event until every tile of the frame loaded. */
	private watchFrame(frame: Frame): void {
		if (frame.onData) return;
		const check = (): void => {
			if (this.pendingKey !== frame.key) {
				this.unwatchFrame(frame);
				return;
			}
			if (this.isFrameLoaded(frame)) {
				this.unwatchFrame(frame);
				this.commit(frame);
			}
		};
		frame.onData = check;
		// `rendercomplete` covers a view that needs no tiles from the frame
		this.map.on('rendercomplete', check);
	}

	private unwatchFrame(frame: Frame): void {
		if (!frame.onData) return;
		this.map.un('rendercomplete', frame.onData);
		frame.onData = undefined;
	}

	private commit(frame: Frame): void {
		// Never interrupt a running dissolve (snapping it mid-way is a visible
		// jump). The commit waits for it — at most crossFadeMs — and chains.
		// pendingKey keeps covering the wait, so that a show() arriving in the
		// meantime abandons the queued frame like any other pending one.
		if (this.dissolve) {
			// …unless the frame to commit is the one that dissolve fades out, in
			// which case it is unwound instead of finished (see `reverseDissolve`).
			if (frame.key === this.dissolve.outOfKey && this.frames.has(this.dissolve.intoKey)) {
				this.reverseDissolve(frame, this.dissolve);
				return;
			}
			this.queuedCommit = frame;
			this.pendingKey = frame.key;
			return;
		}
		this.queuedCommit = undefined;
		this.pendingKey = null;
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
	 */
	private dissolveRasters(newFrame: Frame, oldFrame: Frame, duration: number): void {
		const newRasters = newFrame.layers.filter((layer) => !isLineLayer(layer));
		const oldRasters = oldFrame.layers.filter((layer) => !isLineLayer(layer));

		// Direct per-frame updates; a running tween must not fight them
		for (const layer of [...newRasters, ...oldRasters]) this.tweens.delete(layer);

		// Progress is integrated rather than derived from a start timestamp, so
		// that the direction can flip mid-flight (`reverse`) without a jump.
		let t = 0;
		let direction = 1;
		let last = performance.now();
		const apply = (): void => {
			const e = t * t * (3 - 2 * t); // smoothstep
			for (const layer of newRasters) this.writeOpacity(layer, layer.peak * e);
			for (const layer of oldRasters) {
				const denominator = 1 - layer.peak * e;
				this.writeOpacity(
					layer,
					t >= 1 || denominator <= 0.001 ? 0 : (layer.peak * (1 - e)) / denominator
				);
			}
		};
		const dissolve: Dissolve = {
			raf: 0,
			intoKey: newFrame.key,
			outOfKey: oldFrame.key,
			reverse: () => {
				direction = -direction;
				last = performance.now();
				// Same rate in both directions: a flip-back right after the commit
				// unwinds near-instantly, a late one takes almost a full fade.
				return (direction < 0 ? t : 1 - t) * duration;
			}
		};
		const step = (now: number): void => {
			t = Math.min(Math.max(t + (direction * (now - last)) / duration, 0), 1);
			last = now;
			apply();
			if (direction > 0 ? t < 1 : t > 0) {
				dissolve.raf = requestAnimationFrame(step);
			} else {
				if (this.dissolve === dissolve) this.dissolve = undefined;
				this.runQueuedCommit();
			}
		};
		dissolve.raf = requestAnimationFrame(step);
		this.dissolve = dissolve;
	}

	/**
	 * Switching back to the frame a running dissolve fades out (scrubbing the
	 * time slider A → B → A): unwind that dissolve instead of queueing a second
	 * one behind it. Finishing first would show B completely before returning to
	 * A and cost twice the fade duration; the compensation curve is symmetric in
	 * `e`, so running it backwards keeps the coverage constant all the way.
	 */
	private reverseDissolve(frame: Frame, dissolve: Dissolve): void {
		const outgoing = this.frames.get(dissolve.intoKey);
		if (!outgoing) return;

		this.queuedCommit = undefined;
		this.pendingKey = null;
		this.clearSlowLoadTimer();

		const remaining = dissolve.reverse();
		dissolve.outOfKey = dissolve.intoKey;
		dissolve.intoKey = frame.key;

		this.currentKey = frame.key;
		this.cancelHide(frame.key);
		// The dissolve only drives the fills; the lines cross-fade on their own
		this.setFrameOpacity(frame, 1, remaining, isLineLayer);
		this.setFrameOpacity(outgoing, 0, remaining, isLineLayer);
		this.scheduleHide(outgoing.key);

		this.evict();
		this.setLoading(false);
		this.opts.onCommit?.();
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
		this.queuedCommit = undefined;
		const pending = this.pendingFrame();
		if (pending) {
			this.unwatchFrame(pending);
			// Keep the partially loaded frame resident; it may be shown later. It
			// never was visible though, so it needs no fade-out — and hiding it
			// right away stops it from loading tiles nobody is waiting for.
			this.cancelHide(pending.key);
			this.setFrameVisibility(pending, false);
		}
		this.pendingKey = null;
		this.clearSlowLoadTimer();
		// Unconditionally, so that a loading state set from outside the manager
		// (the model run switch) clears when the switch needs no new frame
		this.setLoading(false);
	}

	private writeOpacity(layer: FrameLayer, value: number): void {
		layer.opacity = value;
		layer.layer.setOpacity(value);
	}

	/** Set (durationMs undefined) or tween the opacity of the frame's layers. */
	private setFrameOpacity(
		frame: Frame,
		mul: number,
		durationMs?: number,
		filter?: (layer: FrameLayer) => boolean
	): void {
		for (const layer of frame.layers) {
			if (filter && !filter(layer)) continue;
			const target = layer.peak * mul;
			if (durationMs === undefined || durationMs <= 0) {
				this.tweens.delete(layer);
				this.writeOpacity(layer, target);
				continue;
			}
			this.tweens.set(layer, {
				from: layer.opacity,
				to: target,
				start: performance.now(),
				duration: durationMs
			});
		}
		if (this.tweens.size > 0 && !this.tweenRaf) {
			this.tweenRaf = requestAnimationFrame(this.tickTweens);
		}
	}

	private tickTweens = (now: number): void => {
		this.tweenRaf = 0;
		for (const [layer, tween] of this.tweens) {
			const t = Math.min(1, (now - tween.start) / tween.duration);
			this.writeOpacity(layer, tween.from + (tween.to - tween.from) * t);
			if (t >= 1) this.tweens.delete(layer);
		}
		if (this.tweens.size > 0) this.tweenRaf = requestAnimationFrame(this.tickTweens);
	};

	/** Layer layout identity: channel keys without the (time-dependent) URLs. */
	private channelSignature(frame: Frame): string {
		return frame.channels.map((channel) => channel.key).join('|');
	}

	private setFrameVisibility(frame: Frame, visible: boolean): void {
		const wasHidden = frame.hidden === true;
		frame.hidden = !visible;
		for (const frameLayer of frame.layers) {
			frameLayer.layer.setVisible(visible);
			// Whatever loads after this counts again
			if (visible && wasHidden) {
				frameLayer.started = false;
				frameLayer.pending = 0;
			}
		}
		// Only a frame that really was off screen starts its fade-in from zero.
		// Re-showing one that is still fading (switching back and forth within the
		// cross-fade) must keep the opacity it currently contributes, or the
		// basemap flashes through the half-faded incoming frame for one tick.
		if (visible && wasHidden) this.setFrameOpacity(frame, 0);
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
				// It no longer counts as fading, so a deferred eviction can run
				this.evict();
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
		// Current frame is always retained on top of the cap, and so is every frame
		// that is still fading out — removing its layers mid-fade pops, and during
		// a dissolve the basemap would show through the half-faded new frame. Those
		// are exactly the frames with a pending hide timer, which evicts again once
		// it has taken them off screen.
		const removable = this.lru.filter(
			(key) => key !== this.currentKey && key !== this.pendingKey && !this.hideTimers.has(key)
		);
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
		for (const frameLayer of frame.layers) {
			this.tweens.delete(frameLayer);
			this.map.removeLayer(frameLayer.layer);
			frameLayer.layer.dispose();
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
