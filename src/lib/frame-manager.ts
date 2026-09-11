import * as maplibregl from 'maplibre-gl';

/**
 * FrameManager: cross-fading orchestrator for a stack of MapLibre weather layers
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

/** Paint properties MapLibre accepts, narrowed to the opacity ones a frame fades. */
type OpacityPaintProperty = Extract<
	Parameters<maplibregl.Map['setPaintProperty']>[1],
	`${string}-opacity`
>;

export interface ChannelLayerDef {
	/** Base layer id — suffixed per frame for uniqueness. */
	id: string;
	/** Paint property used to fade this layer, e.g. `raster-opacity`. */
	opacityProp: OpacityPaintProperty;
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
	opacityProp: OpacityPaintProperty;
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
	/** Waiting for the render pass that re-populates its sources (see `show`). */
	awaitingRender?: boolean;
	/** Layers are `visibility: none` (set after the fade-out, see `scheduleHide`). */
	hidden?: boolean;
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
	private map: maplibregl.Map;
	private opts: FrameManagerOptions;

	private frames = new Map<string, Frame>();
	private lru: string[] = [];
	private currentKey: string | null = null;
	private pendingKey: string | null = null;
	private frameOrdinal = 0;
	private slowLoadTimer: ReturnType<typeof setTimeout> | undefined;
	private dissolve?: Dissolve;
	/** Frame whose commit waits for the running dissolve to finish. */
	private queuedCommit?: Frame;
	private hideTimers = new Map<string, ReturnType<typeof setTimeout>>();
	// Source errors arrive as ErrorEvents; the source cache forwarding them
	// attaches the sourceId, which the event type does not declare.
	private onMapError: (e: maplibregl.ErrorEvent & { sourceId?: string }) => void;

	constructor(map: maplibregl.Map, opts: FrameManagerOptions = {}) {
		this.map = map;
		this.opts = opts;
		this.onMapError = (e) => {
			// Only errors attributable to one of our own sources fail a frame.
			// Source-less errors (basemap tiles, terrain, glyphs) must not
			// cancel a pending weather switch; a failed om data load rejects the
			// tile request, and the source cache tags that error with a sourceId.
			if (!e.sourceId) return;
			const sourceId = e.sourceId;
			const frame = [...this.frames.values()].find((f) => f.sourceIds.includes(sourceId));
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
		} else {
			this.cancelHide(key);
			// A previously failed frame gets another chance
			frame.errored = false;
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
		// A fully cached frame commits in the very next render pass
		this.awaitRender(frame);
	}

	/**
	 * Hold the frame back until the map has rendered once. MapLibre only
	 * re-populates a source's tiles in the render pass after its layers became
	 * visible again, and reports a source that is not (yet) used by a visible
	 * layer as loaded — so a frame just made visible would look ready while its
	 * tiles are still missing.
	 */
	private awaitRender(frame: Frame): void {
		frame.awaitingRender = true;
		this.map.once('render', () => {
			frame.awaitingRender = false;
			// Re-check: the render itself fires no sourcedata event
			frame.onData?.();
		});
		// Adding or unhiding layers already schedules one, but a frame whose
		// layers all went missing (style reload) would wait forever otherwise
		this.map.triggerRepaint();
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

	private isFrameLoaded(frame: Frame): boolean {
		// Source.loaded() only covers the source metadata (TileJSON), which the om
		// protocol answers before the data download finishes, so every requested
		// tile has to be there too — `isSourceLoaded` covers both, per source.
		// Map-wide (`areTilesLoaded`) it would also wait for the basemap and, worse,
		// for the tiles of the frames the user just scrolled past, which keeps a
		// frame from ever committing while someone scrubs the time slider.
		// Errored frames never commit.
		return (
			!frame.errored &&
			!frame.awaitingRender &&
			frame.sourceIds.every((id) => this.map.getSource(id) && this.map.isSourceLoaded(id))
		);
	}

	/** Fail the pending switch: keep showing the previous frame. */
	private failPending(frame: Frame): void {
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
			if (frame.errored) {
				this.failPending(frame);
				return;
			}
			if (this.isFrameLoaded(frame)) {
				this.unwatchFrame(frame);
				this.commit(frame);
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
	 * Needs rAF driving — paint transitions cannot express the curve.
	 */
	private dissolveRasters(newFrame: Frame, oldFrame: Frame, duration: number): void {
		const newRasters = newFrame.layers.filter((layer) => !isLineLayer(layer));
		const oldRasters = oldFrame.layers.filter((layer) => !isLineLayer(layer));

		// Direct per-frame updates; the declarative transition must not smooth them
		for (const layer of [...newRasters, ...oldRasters]) {
			if (this.map.getLayer(layer.layerId)) {
				this.map.setPaintProperty(layer.layerId, `${layer.opacityProp}-transition`, {
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

		// Progress is integrated rather than derived from a start timestamp, so
		// that the direction can flip mid-flight (`reverse`) without a jump.
		let t = 0;
		let direction = 1;
		let last = performance.now();
		const apply = (): void => {
			const e = t * t * (3 - 2 * t); // smoothstep
			for (const layer of newRasters) setOpacity(layer, layer.peak * e);
			for (const layer of oldRasters) {
				const denominator = 1 - layer.peak * e;
				setOpacity(
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
		// The rAF only drives the fills; the lines cross-fade declaratively
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
				this.map.setPaintProperty(layer.layerId, `${layer.opacityProp}-transition`, {
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
		const wasHidden = frame.hidden === true;
		frame.hidden = !visible;
		for (const { layerId } of frame.layers) {
			if (this.map.getLayer(layerId)) {
				this.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
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
