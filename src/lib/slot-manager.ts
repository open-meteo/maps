import * as maplibregl from 'maplibre-gl';

/**
 * SlotManager: double-buffered A/B slot system for MapLibre layers.
 *
 * Problem: MapLibre's `source.setUrl()` / `source.setTiles()` does not
 * reliably abort in-flight tile requests, leading to stale tiles appearing
 * briefly after a URL change. Removing a source and re-adding it works, but
 * causes a visible gap while new tiles load.
 *
 * Solution: maintain two slots (A and B). The active slot stays visible while
 * the pending slot loads its new source in the background. Once the pending
 * slot's source reports `loaded()`, we fade in the new slot and fade out the
 * old one, then remove the old slot after a delay. This guarantees no visual
 * gap and smooth opacity transitions between data updates.
 *
 * Each slot owns its own source and set of layers. The `slotLayers` record
 * tracks which layers were actually added per slot, so removal always
 * references the correct layer ids even when `layerFactory` returns different
 * layers between calls.
 */

type Slot = 'A' | 'B';

export interface SlotLayer {
	/** Base layer id — suffixed with `_A` or `_B` per slot. */
	id: string;
	/** Paint property used for opacity (e.g. `raster-opacity`, `line-opacity`). */
	opacityProp: string;
	/** Target opacity set when the slot becomes active. */
	commitOpacity: number;
	/** Add the layer to the map. Must set initial opacity to 0 for fade-in. */
	add: (map: maplibregl.Map, sourceId: string, layerId: string, beforeLayer: string) => void;
}

export interface SlotManagerOptions {
	sourceIdPrefix: string;
	/** Called on each `update()` to get fresh layer definitions. */
	layerFactory: () => SlotLayer[];
	beforeLayer: string;
	sourceSpec: (sourceUrl: string) => maplibregl.SourceSpecification;
	/** Delay in ms before removing the previous slot after fade-out. Default: 300 */
	removeDelayMs?: number;
	/** Called once the new slot is committed and visible. */
	onCommit?: () => void;
	/** Called on source load error. */
	onError?: () => void;
	slowLoadWarningMs?: number;
	onSlowLoad?: () => void;
}

export class SlotManager {
	private map: maplibregl.Map;
	private opts: SlotManagerOptions;
	private activeSlot: Slot | null = null;
	private pendingSlot: Slot | null = null;
	private cleanupListener: (() => void) | null = null;
	/** Tracks which layers were actually added per slot for correct removal. */
	private slotLayers: Record<Slot, SlotLayer[]> = { A: [], B: [] };

	constructor(map: maplibregl.Map, opts: SlotManagerOptions) {
		this.map = map;
		this.opts = opts;
	}

	getActiveSourceUrl(): string | undefined {
		if (!this.activeSlot) return undefined;
		const srcId = this.sourceId(this.activeSlot);
		const source = this.map.getSource(srcId) as maplibregl.RasterTileSource | undefined;
		return source?.url;
	}

	setBeforeLayer(beforeLayer: string): void {
		this.opts.beforeLayer = beforeLayer;
	}

	update(sourceUrl: string): void {
		this.cleanupListener?.();
		this.cleanupListener = null;

		// Abandon stale pending slot
		if (this.pendingSlot !== null && this.pendingSlot !== this.activeSlot) {
			this.forceRemoveSlot(this.pendingSlot);
			this.pendingSlot = null;
		}

		const nextSlot: Slot = this.activeSlot === 'A' ? 'B' : 'A';

		// Clean the next slot using its own recorded layers
		this.forceRemoveSlot(nextSlot);

		this.pendingSlot = nextSlot;
		this.addSlotLayers(nextSlot, sourceUrl);

		const sourceId = this.sourceId(nextSlot);
		if (!this.map.style.getSource(sourceId)) {
			if (this.activeSlot) {
				this.forceRemoveSlot(this.activeSlot);
			}
			this.activeSlot = null;
			this.pendingSlot = null;
			return;
		}

		this.waitForLoad(nextSlot, sourceId, this.activeSlot);
	}

	destroy(): void {
		this.cleanupListener?.();
		this.cleanupListener = null;
		this.forceRemoveSlot('A');
		this.forceRemoveSlot('B');
		this.activeSlot = null;
		this.pendingSlot = null;
	}

	private sourceId(slot: Slot): string {
		return `${this.opts.sourceIdPrefix}_${slot}`;
	}

	private layerId(layer: SlotLayer, slot: Slot): string {
		return `${layer.id}_${slot}`;
	}

	private setSlotOpacity(slot: Slot, target: 'commit' | 'zero'): void {
		for (const layer of this.slotLayers[slot]) {
			const id = this.layerId(layer, slot);
			if (this.map.getLayer(id)) {
				const value = target === 'commit' ? layer.commitOpacity : 0;
				this.map.setPaintProperty(id, layer.opacityProp, value);
			}
		}
	}

	private forceRemoveSlot(slot: Slot): void {
		for (const layer of this.slotLayers[slot]) {
			const id = this.layerId(layer, slot);
			if (this.map.getLayer(id)) this.map.removeLayer(id);
		}
		this.slotLayers[slot] = [];
		const srcId = this.sourceId(slot);
		if (this.map.style.getSource(srcId)) this.map.removeSource(srcId);
	}

	private removeSlot(slot: Slot): void {
		if (slot === this.activeSlot || slot === this.pendingSlot) return;
		this.forceRemoveSlot(slot);
	}

	private addSlotLayers(slot: Slot, sourceUrl: string): void {
		const sourceId = this.sourceId(slot);
		this.map.addSource(sourceId, this.opts.sourceSpec(sourceUrl));

		const layers = this.opts.layerFactory();
		const addedLayers: SlotLayer[] = [];

		for (const layer of layers) {
			const layerId = this.layerId(layer, slot);
			layer.add(this.map, sourceId, layerId, this.opts.beforeLayer);
			if (this.map.getLayer(layerId)) {
				addedLayers.push(layer);
			}
		}

		this.slotLayers[slot] = addedLayers;
	}

	private commit(nextSlot: Slot, previousSlot: Slot | null): void {
		this.activeSlot = nextSlot;
		this.pendingSlot = null;

		// Fade in new slot to each layer's target opacity
		this.setSlotOpacity(nextSlot, 'commit');

		// Fade out previous slot
		if (previousSlot) {
			this.setSlotOpacity(previousSlot, 'zero');
		}

		this.opts.onCommit?.();

		// Remove previous slot after fade-out completes
		if (previousSlot) {
			const delay = this.opts.removeDelayMs ?? 300;
			setTimeout(() => this.removeSlot(previousSlot), delay);
		}
	}

	private waitForLoad(nextSlot: Slot, sourceId: string, previousSlot: Slot | null): void {
		if (this.map.style.getSource(sourceId)?.loaded()) {
			this.commit(nextSlot, previousSlot);
			return;
		}

		let warningTimeout: ReturnType<typeof setTimeout> | undefined;
		if (this.opts.slowLoadWarningMs && this.opts.onSlowLoad) {
			warningTimeout = setTimeout(this.opts.onSlowLoad, this.opts.slowLoadWarningMs);
		}

		const cleanup = (): void => {
			if (warningTimeout !== undefined) clearTimeout(warningTimeout);
			this.map.off('sourcedata', onSourceData);
			this.map.off('error', onError);
			this.cleanupListener = null;
		};

		const onSourceData = (e: maplibregl.MapSourceDataEvent): void => {
			if (e.sourceId !== sourceId || !e.isSourceLoaded || e.dataType !== 'source') return;
			if (this.pendingSlot !== nextSlot) {
				cleanup();
				return;
			}
			if (this.map.style.getSource(sourceId)?.loaded()) {
				cleanup();
				this.commit(nextSlot, previousSlot);
			}
		};

		const onError = (e: maplibregl.MapSourceDataEvent): void => {
			if (e.sourceId !== sourceId) return;
			cleanup();
			this.opts.onError?.();
		};

		this.map.on('sourcedata', onSourceData);
		this.map.on('error', onError);
		this.cleanupListener = cleanup;
	}
}
