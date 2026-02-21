<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	import MousePointerIcon from '@lucide/svelte/icons/mouse-pointer';
	import PentagonIcon from '@lucide/svelte/icons/pentagon';
	import SplineIcon from '@lucide/svelte/icons/spline';
	import SquareIcon from '@lucide/svelte/icons/square';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import {
		TerraDraw,
		TerraDrawFreehandMode,
		TerraDrawPolygonMode,
		TerraDrawRectangleMode,
		TerraDrawRenderMode,
		TerraDrawSelectMode
	} from 'terra-draw';
	import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';

	import { browser } from '$app/environment';

	import { clippingPanelOpen, suppressPopupUntil, terraDrawActive } from '$lib/stores/clipping';
	import { map } from '$lib/stores/map';
	import { omProtocolSettings } from '$lib/stores/om-protocol-settings';

	import CountrySelector from './country-selector.svelte';

	import type { Country } from './country-data';

	interface Props {
		onselect?: (countries: Country[]) => void;
		onclippingchange?: () => void;
	}

	let { onselect, onclippingchange }: Props = $props();

	let countrySelectorRef = $state<ReturnType<typeof CountrySelector>>();

	const DRAWN_FEATURES_KEY = 'om-clipping-drawn-features';

	let draw: TerraDraw | undefined = $state(undefined);
	let activeMode = $state<string>('');
	/** Accumulated drawn features that have been finalized. */
	let drawnFeatures: any[] = $state(loadDrawnFeatures());
	/** Country clipping set by the country selector (kept separately so draws don't erase it). */
	let countryClipping: any = $state(undefined);

	function loadDrawnFeatures(): any[] {
		if (!browser) return [];
		try {
			const raw = localStorage.getItem(DRAWN_FEATURES_KEY);
			const parsed = raw ? JSON.parse(raw) : [];
			if (!Array.isArray(parsed)) return [];
			return parsed
				.filter((feature) => feature?.geometry?.type === 'Polygon')
				.map((feature, index) => ({
					...feature,
					id: feature?.id ?? `drawn-${Date.now()}-${index}`,
					properties: {
						...(feature?.properties ?? {}),
						mode: feature?.properties?.mode ?? 'polygon'
					}
				}));
		} catch {
			return [];
		}
	}

	function saveDrawnFeatures() {
		if (!browser) return;
		if (drawnFeatures.length === 0) {
			localStorage.removeItem(DRAWN_FEATURES_KEY);
		} else {
			localStorage.setItem(DRAWN_FEATURES_KEY, JSON.stringify(drawnFeatures));
		}
	}

	export const initTerraDraw = () => {
		if (!$map || draw) return;

		draw = new TerraDraw({
			adapter: new TerraDrawMapLibreGLAdapter({ map: $map }),
			modes: [
				new TerraDrawPolygonMode({
					styles: {
						fillColor: '#3b82f6',
						fillOpacity: 0.15,
						outlineColor: '#3b82f6',
						outlineWidth: 2
					}
				}),
				new TerraDrawFreehandMode({
					styles: {
						fillColor: '#8b5cf6',
						fillOpacity: 0.15,
						outlineColor: '#8b5cf6',
						outlineWidth: 2
					}
				}),
				new TerraDrawRectangleMode({
					styles: {
						fillColor: '#06b6d4',
						fillOpacity: 0.15,
						outlineColor: '#06b6d4',
						outlineWidth: 2
					}
				}),
				new TerraDrawSelectMode({
					flags: {
						polygon: {
							feature: {
								draggable: true,
								coordinates: {
									midpoints: true,
									draggable: true,
									deletable: true
								}
							}
						},
						freehand: {
							feature: {
								draggable: true,
								coordinates: {
									midpoints: true,
									draggable: true,
									deletable: true
								}
							}
						},
						rectangle: {
							feature: {
								draggable: true,
								coordinates: {
									midpoints: true,
									draggable: true,
									deletable: true
								}
							}
						}
					}
				}),
				new TerraDrawRenderMode({
					modeName: 'static',
					styles: {
						polygonFillColor: '#9ca3af',
						polygonFillOpacity: 0.1,
						polygonOutlineColor: '#9ca3af',
						polygonOutlineWidth: 1
					}
				})
			]
		});

		draw.start();

		draw.on('finish', () => {
			if (activeMode === 'select') {
				suppressPopupUntil.set(Date.now() + 250);
				syncEditedGeometryFromSnapshot();
				return;
			}
			mergeDrawnGeometry();
		});
	};

	/** Merge drawn polygons into the current clippingOptions and notify the parent. */
	const mergeDrawnGeometry = () => {
		if (!draw) return;
		const snapshot = draw.getSnapshot();
		const newPolygons = snapshot.filter((f) => f.geometry.type === 'Polygon');
		if (newPolygons.length === 0) return;

		drawnFeatures = [...drawnFeatures, ...newPolygons];
		saveDrawnFeatures();
		suppressPopupUntil.set(Date.now() + 250);

		draw.clear();
		exitDrawingMode(true);
		rebuildClippingOptions();
	};

	const syncEditedGeometryFromSnapshot = () => {
		if (!draw) return;
		drawnFeatures = draw.getSnapshot().filter((f) => f.geometry.type === 'Polygon');
		saveDrawnFeatures();
		rebuildClippingOptions();
	};

	const loadDrawnFeaturesIntoDraw = () => {
		if (!draw) return;
		draw.clear();
		if (drawnFeatures.length > 0) {
			draw.addFeatures(drawnFeatures as any);
		}
	};

	/**
	 * Rebuild clippingOptions from both country geojson and drawn features.
	 * Called when either source changes.
	 */
	export const rebuildClippingOptions = () => {
		// Collect country features from the stored country clipping
		let countryFeatures: any[] = [];
		const cg = (countryClipping as any)?.geojson;
		if (cg) {
			if ('features' in cg) {
				countryFeatures = cg.features;
			} else if (cg.type === 'Feature') {
				countryFeatures = [cg];
			} else {
				countryFeatures = [{ type: 'Feature', properties: null, geometry: cg }];
			}
		}

		const drawnGeoJsonFeatures = drawnFeatures
			.filter((feature) => feature?.geometry?.type === 'Polygon')
			.map((feature) => ({
				type: 'Feature' as const,
				properties: {} as Record<string, unknown>,
				geometry: feature.geometry
			}));
		const allFeatures = [...countryFeatures, ...drawnGeoJsonFeatures];
		if (allFeatures.length === 0) {
			($omProtocolSettings as any).clippingOptions = undefined;
		} else {
			($omProtocolSettings as any).clippingOptions = {
				geojson: {
					type: 'FeatureCollection',
					features: allFeatures
				}
			};
		}

		onclippingchange?.();
	};

	/** Called by the parent when country selection produces new clipping. */
	export const setCountryClipping = (clipping: any) => {
		countryClipping = clipping;
		rebuildClippingOptions();
	};

	const setMode = (mode: string) => {
		if (!draw) return;
		if (activeMode === mode) {
			exitDrawingMode();
		} else {
			let featureIdToSelect: string | number | undefined;
			if (mode === 'select') {
				loadDrawnFeaturesIntoDraw();
				const snapshot = draw.getSnapshot();
				featureIdToSelect = snapshot.at(-1)?.id;
			} else {
				draw.clear();
			}
			draw.setMode(mode);
			activeMode = mode;
			terraDrawActive.set(true);
			if (mode === 'select' && featureIdToSelect !== undefined) {
				draw.selectFeature(featureIdToSelect);
			}
		}
	};

	const exitDrawingMode = (deferDeactivation = false) => {
		if (draw) {
			const snapshot = draw.getSnapshot();
			for (const feature of snapshot) {
				if (feature.id !== undefined) {
					draw.deselectFeature(feature.id);
				}
			}
			draw.setMode('static');
		}
		activeMode = '';
		if (deferDeactivation) {
			queueMicrotask(() => terraDrawActive.set(false));
		} else {
			terraDrawActive.set(false);
		}
		$map?.getCanvas().style.removeProperty('cursor');
	};

	const clearDrawings = () => {
		if (!draw) return;
		draw.clear();
		drawnFeatures = [];
		saveDrawnFeatures();
		exitDrawingMode();
		countryClipping = undefined;
		countrySelectorRef?.clearAll();
		rebuildClippingOptions();
	};

	const handleEscapeKeydown = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			exitDrawingMode();
		}
	};

	onMount(() => {
		if (browser) {
			window.addEventListener('keydown', handleEscapeKeydown, true);
			// Restore persisted drawn features into clipping on load
			if (drawnFeatures.length > 0) {
				rebuildClippingOptions();
			}
		}
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('keydown', handleEscapeKeydown, true);
		}
		if (draw) {
			draw.stop();
			draw = undefined;
		}
		terraDrawActive.set(false);
	});
</script>

{#if $clippingPanelOpen}
	<div
		class="fixed top-2.5 right-12.5 z-10 flex flex-col gap-2 rounded-sm bg-glass/80 p-3 shadow-lg backdrop-blur-sm"
	>
		<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Clipping</p>

		<div class="mt-1 flex flex-col gap-1.5">
			<div class="flex gap-1">
				<button
					class="inline-flex cursor-pointer h-8 w-8 items-center justify-center rounded-md transition-colors
						{activeMode === 'polygon'
						? 'bg-primary text-primary-foreground'
						: 'bg-secondary text-secondary-foreground hover:bg-accent'}"
					title="Draw polygon"
					onclick={() => setMode('polygon')}
				>
					<PentagonIcon class="h-4 w-4" />
				</button>
				<button
					class="inline-flex cursor-pointer h-8 w-8 items-center justify-center rounded-md transition-colors
						{activeMode === 'rectangle'
						? 'bg-primary text-primary-foreground'
						: 'bg-secondary text-secondary-foreground hover:bg-accent'}"
					title="Draw rectangle"
					onclick={() => setMode('rectangle')}
				>
					<SquareIcon class="h-4 w-4" />
				</button>
				<button
					class="inline-flex cursor-pointer h-8 w-8 items-center justify-center rounded-md transition-colors
						{activeMode === 'freehand'
						? 'bg-primary text-primary-foreground'
						: 'bg-secondary text-secondary-foreground hover:bg-accent'}"
					title="Draw freehand"
					onclick={() => setMode('freehand')}
				>
					<SplineIcon class="h-4 w-4" />
				</button>
				<button
					class="inline-flex cursor-pointer h-8 w-8 items-center justify-center rounded-md transition-colors
						{activeMode === 'select'
						? 'bg-primary text-primary-foreground'
						: 'bg-secondary text-secondary-foreground hover:bg-accent'}"
					title="Select & edit"
					onclick={() => setMode('select')}
				>
					<MousePointerIcon class="h-4 w-4" />
				</button>
				<button
					class="inline-flex cursor-pointer h-8 w-8 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
					title="Clear drawings"
					onclick={clearDrawings}
				>
					<Trash2Icon class="h-4 w-4" />
				</button>
			</div>
		</div>
		<CountrySelector bind:this={countrySelectorRef} {onselect} />
	</div>
{/if}
