/**
 * GpuRasterManager: the GPU replacement for the FrameManager's raster
 * channels. Each chart source gets one persistent `WeatherGpuLayer` (a
 * tile-free MapLibre custom layer rendering the field per pixel in a
 * shader); showing a new render state diffs against the existing slots:
 *
 * - URL change (timestep scrub): `prepareUrl` — the layer keeps showing the
 *   old data until the new timestep is loaded; all changed slots then commit
 *   together (through the render state's CommitBarrier, which also covers the
 *   CPU vector frame), blending the *data values* in-shader.
 * - Opacity / anchor / arrow-config changes: uniform updates, no reload.
 * - Sources appearing/disappearing: layers are added/removed.
 *
 * Seamless composite domains render natively (multi-layer blend in the
 * shader). Wind arrows in the plain arrow style draw as instanced overlay
 * passes of the same GPU layers; contours, grid points and wind barbs stay on
 * the CPU tile pipeline via the FrameManager.
 */
import { WeatherGpuLayer, getStateValues, updateCurrentBounds } from '@openmeteo/weather-map-layer';

import type { CommitBarrier } from '$lib/commit-barrier';
import type {
	GpuArrowConfig,
	GpuContourStyle,
	OmProtocolSettings
} from '@openmeteo/weather-map-layer';
import type maplibregl from 'maplibre-gl';

export interface GpuRasterSlotSpec {
	/** Stable slot key: the chart source key, or `<sourceKey>:arrows`. */
	key: string;
	/** om:// URL of the data (identity of what is shown). */
	url: string;
	/** Layer opacity 0..1. */
	opacity: number;
	/** Layer id in the basemap style to insert before. */
	beforeLayer: string;
	/** Draw the colour-mapped raster field. */
	raster: boolean;
	/** Instanced wind-arrow overlay configuration. */
	arrows?: GpuArrowConfig;
	/** In-shader contour isoline styling. */
	contours?: GpuContourStyle;
}

export interface GpuRasterManagerOptions {
	settings: OmProtocolSettings;
	/** VRAM budget (MB) for the shared value-texture cache of the GPU layers. */
	textureCacheMb?: number;
	onLoadingChange?: (loading: boolean) => void;
	/** Fired when a slot batch committed its loaded URLs (like a frame commit). */
	onShown?: () => void;
	onError?: (error: unknown) => void;
}

interface Slot {
	layer: WeatherGpuLayer;
	layerId: string;
	url: string;
	opacity: number;
	beforeLayer: string;
	arrowsKey: string;
	contoursKey: string;
}

/** A slot replacement in flight: new layers dissolve in over retiring ones. */
interface Transition {
	entering: Slot[];
	retiring: Slot[];
}

export class GpuRasterManager {
	private map: maplibregl.Map;
	private opts: GpuRasterManagerOptions;
	private slots = new Map<string, Slot>();
	private pendingLoads = 0;
	private fadeMs: number | undefined;
	private dissolve: { raf: number; transition: Transition } | undefined;
	private pendingTransition: Transition | undefined;
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
			// Arrow overlay slots (`<sourceKey>:arrows`) shadow their source's data
			if (key.includes(':')) continue;
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
		this.finalizeTransition();
		const seen = new Set<string>();
		const prepares: Promise<(() => void) | null>[] = [];
		const entering: Slot[] = [];

		for (const spec of specs) {
			seen.add(spec.key);
			let slot = this.slots.get(spec.key);
			if (!slot) {
				const layerId = `gpuRaster_${spec.key.replace(/:/g, '_')}`;
				const layer = new WeatherGpuLayer({
					id: layerId,
					opacity: spec.opacity,
					settings: this.opts.settings,
					drawRaster: spec.raster,
					textureCacheMb: this.opts.textureCacheMb,
					fadeMs: this.fadeMs
				});
				const before = this.map.getLayer(spec.beforeLayer) ? spec.beforeLayer : undefined;
				this.map.addLayer(layer, before);
				slot = {
					layer,
					layerId,
					url: '',
					opacity: spec.opacity,
					beforeLayer: spec.beforeLayer,
					arrowsKey: '',
					contoursKey: ''
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
				slot.layer.setOpacity(spec.opacity);
			}
			const arrowsKey = spec.arrows ? JSON.stringify(spec.arrows) : '';
			if (slot.arrowsKey !== arrowsKey) {
				slot.arrowsKey = arrowsKey;
				slot.layer.setArrows(spec.arrows);
			}
			const contoursKey = spec.contours ? JSON.stringify(spec.contours) : '';
			if (slot.contoursKey !== contoursKey) {
				slot.contoursKey = contoursKey;
				slot.layer.setContours(spec.contours);
			}
			if (slot.url !== spec.url) {
				slot.url = spec.url;
				prepares.push(this.prepareSlot(slot, spec.url));
			}
		}

		// A replaced source (e.g. a variable switch swaps the slot key) keeps its
		// old layer on screen while the new one loads, then both dissolve — the
		// same visual as a timestep morph, but as an opacity crossfade. A plain
		// removal (source deleted) disappears immediately.
		const retiring: Slot[] = [];
		for (const [key, slot] of [...this.slots]) {
			if (seen.has(key)) continue;
			this.slots.delete(key);
			if (entering.length > 0 && prepares.length > 0) {
				retiring.push(slot);
			} else if (this.map.getLayer(slot.layerId)) {
				this.map.removeLayer(slot.layerId);
			}
		}
		let transition: Transition | undefined;
		if (retiring.length > 0) {
			// Entering layers show nothing until their commit; start them invisible
			// so the dissolve controls their appearance.
			for (const slot of entering) slot.layer.setOpacity(0);
			transition = { entering, retiring };
			this.pendingTransition = transition;
		}

		if (prepares.length === 0) {
			barrier?.arrive();
			return;
		}

		this.pendingLoads++;
		this.opts.onLoadingChange?.(true);
		void Promise.all(prepares)
			.then((commits) => {
				// Superseded loads resolve null (per-slot URL check + the layer's own
				// load sequence), so stale commits are already no-ops.
				const valid = commits.filter((commit): commit is () => void => commit !== null);
				const commitAll =
					valid.length > 0
						? (): void => {
								for (const commit of valid) commit();
								if (transition && this.pendingTransition === transition) {
									this.pendingTransition = undefined;
									this.startDissolve(transition);
								}
								this.opts.onShown?.();
							}
						: undefined;
				if (!commitAll && transition && this.pendingTransition === transition) {
					// The whole batch was superseded or failed: no dissolve, clean up.
					this.pendingTransition = undefined;
					this.endTransition(transition);
				}
				if (barrier) {
					barrier.arrive(commitAll);
				} else {
					commitAll?.();
				}
			})
			.finally(() => {
				this.pendingLoads--;
				if (this.pendingLoads === 0) this.opts.onLoadingChange?.(false);
			});
	}

	/** Cross-dissolve entering layers over retiring ones, then drop the old. */
	private startDissolve(transition: Transition): void {
		const duration = 250;
		const start = performance.now();
		const step = (now: number): void => {
			const t = Math.min(1, (now - start) / duration);
			const e = t * t * (3 - 2 * t);
			for (const slot of transition.entering) slot.layer.setOpacity(slot.opacity * e);
			for (const slot of transition.retiring) {
				const p = slot.opacity;
				slot.layer.setOpacity(t >= 1 ? 0 : (p * (1 - e)) / Math.max(0.001, 1 - p * e));
			}
			if (t < 1) {
				this.dissolve = { raf: requestAnimationFrame(step), transition };
			} else {
				this.dissolve = undefined;
				this.endTransition(transition);
			}
		};
		this.dissolve = { raf: requestAnimationFrame(step), transition };
	}

	/** Remove the retiring layers and settle the entering ones on their target. */
	private endTransition(transition: Transition): void {
		for (const slot of transition.retiring) {
			if (this.map.getLayer(slot.layerId)) this.map.removeLayer(slot.layerId);
		}
		for (const slot of transition.entering) slot.layer.setOpacity(slot.opacity);
	}

	/** Snap any in-flight replacement to its end state (a newer show supersedes it). */
	private finalizeTransition(): void {
		if (this.dissolve) {
			cancelAnimationFrame(this.dissolve.raf);
			this.endTransition(this.dissolve.transition);
			this.dissolve = undefined;
		}
		if (this.pendingTransition) {
			this.endTransition(this.pendingTransition);
			this.pendingTransition = undefined;
		}
	}

	/**
	 * The protocol's viewport crop (`currentBounds`) historically updated on the
	 * map's `dataloading` event — which barely fires on the tile-free GPU path
	 * (not at all with a warm basemap cache), leaving requests parsed against a
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

	isLoading(): boolean {
		return this.pendingLoads > 0;
	}

	/**
	 * VRAM usage of the GPU layers. All layers share one renderer per GL
	 * context, so any slot reports the global figure.
	 */
	getMemoryUsage(): { bytes: number; budgetBytes: number; textures: number } {
		const first = this.slots.values().next().value;
		return first?.layer.getMemoryUsage() ?? { bytes: 0, budgetBytes: 0, textures: 0 };
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

	/**
	 * Set the temporal blend duration on every layer (current and future). The
	 * animation loop matches it to its frame interval, so consecutive timesteps
	 * morph back to back into one continuous animation.
	 */
	setFadeMs(fadeMs: number): void {
		this.fadeMs = fadeMs;
		for (const slot of this.slots.values()) slot.layer.setFadeMs(fadeMs);
	}

	/**
	 * Cache residency of the primary raster source at other timesteps: whether
	 * the timestep's data is decoded in RAM, and additionally uploaded to VRAM.
	 * Derived by substituting the valid-time file segment of the active URL.
	 */
	getTimestepResidency(
		times: Date[],
		formatTime: (t: Date) => string
	): ('none' | 'ram' | 'vram')[] {
		const slot = [...this.slots.entries()].find(([key, s]) => !key.includes(':') && s.url)?.[1];
		if (!slot) return times.map(() => 'none');
		return times.map((time) => {
			const url = slot.url.replace(/\d{4}-\d{2}-\d{2}T\d{4}\.om/, `${formatTime(time)}.om`);
			// Texture labels outlive the small decoded-RAM state cache, so VRAM
			// residency is checked first and independently.
			if (slot.layer.hasTextureForUrl(url)) return 'vram';
			return getStateValues(url) ? 'ram' : 'none';
		});
	}

	destroy(): void {
		this.finalizeTransition();
		this.map.off('moveend', this.onMoveEnd);
		for (const slot of this.slots.values()) {
			if (this.map.getLayer(slot.layerId)) this.map.removeLayer(slot.layerId);
		}
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
