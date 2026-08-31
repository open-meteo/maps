/**
 * GpuRasterManager: the GPU replacement for the FrameManager's raster
 * channels. Each chart source gets one persistent `WeatherGpuLayer` (a
 * tile-free MapLibre custom layer rendering the field per pixel in a
 * shader); showing a new render state diffs against the existing slots:
 *
 * - URL change (timestep scrub): `setUrl` — the layer keeps showing the old
 *   data until the new timestep is loaded, then blends the *data values*
 *   in-shader (real temporal interpolation, replacing the FrameManager's
 *   raster dissolve).
 * - Opacity / anchor changes: uniform update / `moveLayer`, no reload.
 * - Sources appearing/disappearing: layers are added/removed.
 *
 * Seamless composite domains render natively (multi-layer blend in the
 * shader); vector channels (contours/arrows/grid) stay on the CPU tile
 * pipeline via the FrameManager.
 */
import { WeatherGpuLayer } from '@openmeteo/weather-map-layer';

import type { OmProtocolSettings } from '@openmeteo/weather-map-layer';
import type maplibregl from 'maplibre-gl';

export interface GpuRasterSlotSpec {
	/** Stable slot key (the chart source key, e.g. `temperature_2m`). */
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
	/** Fired when a slot finished loading its URL (like a frame commit). */
	onShown?: () => void;
	onError?: (error: unknown) => void;
}

interface Slot {
	layer: WeatherGpuLayer;
	layerId: string;
	url: string;
	opacity: number;
	beforeLayer: string;
}

export class GpuRasterManager {
	private map: maplibregl.Map;
	private opts: GpuRasterManagerOptions;
	private slots = new Map<string, Slot>();
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

	/** URLs currently shown, per slot key (for the popup). */
	getActiveUrls(): Map<string, string> {
		const urls = new Map<string, string>();
		for (const [key, slot] of this.slots) {
			if (slot.url) urls.set(key, slot.url);
		}
		return urls;
	}

	/** Reconcile the on-map layers with the requested render state. */
	show(specs: GpuRasterSlotSpec[]): void {
		const seen = new Set<string>();
		for (const spec of specs) {
			seen.add(spec.key);
			let slot = this.slots.get(spec.key);
			if (!slot) {
				const layerId = `gpuRaster_${spec.key}`;
				const layer = new WeatherGpuLayer({
					id: layerId,
					opacity: spec.opacity,
					settings: this.opts.settings
				});
				const before = this.map.getLayer(spec.beforeLayer) ? spec.beforeLayer : undefined;
				this.map.addLayer(layer, before);
				slot = { layer, layerId, url: '', opacity: spec.opacity, beforeLayer: spec.beforeLayer };
				this.slots.set(spec.key, slot);
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
			if (slot.url !== spec.url) {
				slot.url = spec.url;
				this.load(slot, spec.url);
			}
		}

		for (const [key, slot] of [...this.slots]) {
			if (seen.has(key)) continue;
			if (this.map.getLayer(slot.layerId)) this.map.removeLayer(slot.layerId);
			this.slots.delete(key);
		}
	}

	/** Re-resolve every slot's URL against the current viewport crop. */
	refresh(): void {
		for (const slot of this.slots.values()) {
			if (!slot.url) continue;
			slot.layer.setUrl(slot.url).catch(() => {
				// A refresh failure keeps showing the previous crop; the visible
				// error path is the initial load in load().
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

	destroy(): void {
		this.map.off('moveend', this.onMoveEnd);
		for (const slot of this.slots.values()) {
			if (this.map.getLayer(slot.layerId)) this.map.removeLayer(slot.layerId);
		}
		this.slots.clear();
	}

	private load(slot: Slot, url: string): void {
		this.pendingLoads++;
		this.opts.onLoadingChange?.(true);
		slot.layer
			.setUrl(url)
			.then(() => {
				// Only report a commit for the URL still current for this slot
				if (slot.url === url) this.opts.onShown?.();
			})
			.catch((error) => {
				if (slot.url === url) this.opts.onError?.(error);
			})
			.finally(() => {
				this.pendingLoads--;
				if (this.pendingLoads === 0) this.opts.onLoadingChange?.(false);
			});
	}
}
