<script lang="ts">
	import { onDestroy, onMount, tick, untrack } from 'svelte';

	import MousePointerIcon from '@lucide/svelte/icons/mouse-pointer';
	import PaintbrushIcon from '@lucide/svelte/icons/paintbrush';
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

	import { clippingCountryCodes, clippingPanelOpen, terraDrawActive } from '$lib/stores/clipping';
	import { map } from '$lib/stores/map';
	import { omProtocolSettings } from '$lib/stores/om-protocol-settings';

	import {
		CLIP_COUNTRIES_PARAM,
		buildCountryClippingOptions,
		serializeClipCountriesParam
	} from '$lib/clipping';
	import { changeOMfileURL } from '$lib/layers';
	import { updateUrl } from '$lib/url';

	import CountrySelector from './country-selector.svelte';

	import type { Country } from './country-data';
	import type {
		ClippingOptions,
		GeoJsonFeature,
		GeoJsonGeometry
	} from '@openmeteo/weather-map-layer';
	import type { Polygon } from 'geojson';
	import type { GeoJSONStoreFeatures } from 'terra-draw';

	let countrySelectorRef = $state<ReturnType<typeof CountrySelector>>();

	const DRAWN_FEATURES_KEY = 'om-clipping-drawn-features';
	const FILL_RULE_KEY = 'om-clipping-fill-rule';

	let draw: TerraDraw | undefined = $state(undefined);
	let activeMode = $state<string>('');
	/** Accumulated drawn features that have been finalized. */
	let drawnFeatures: GeoJSONStoreFeatures<Polygon>[] = $state(loadDrawnFeatures());
	/** Country clipping set by the country selector (kept separately so draws don't erase it). */
	let countryClipping: ClippingOptions = $state<ClippingOptions>(undefined);
	/** Fill rule for canvas clipping: 'nonzero' includes all rings, 'evenodd' excludes holes. */
	let fillRule = $state<'nonzero' | 'evenodd'>(
		browser && localStorage.getItem(FILL_RULE_KEY) === 'evenodd' ? 'evenodd' : 'nonzero'
	);

	function loadDrawnFeatures(): GeoJSONStoreFeatures<Polygon>[] {
		if (!browser) return [];
		try {
			const raw = localStorage.getItem(DRAWN_FEATURES_KEY);
			const parsed = raw ? JSON.parse(raw) : [];
			if (!Array.isArray(parsed)) return [];
			return (parsed as GeoJSONStoreFeatures<Polygon>[])
				.filter(
					(feature): feature is GeoJSONStoreFeatures<Polygon> =>
						feature?.geometry?.type === 'Polygon'
				)
				.map((feature, index) => ({
					...feature,
					id: feature?.id ?? `drawn-${Date.now()}-${index}`,
					properties: {
						...(feature?.properties ?? {}),
						mode: (feature?.properties?.mode as string) ?? 'polygon'
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
		if (!$map) return;

		// Clean up any existing draw instance (helps with HMR)
		if (draw) {
			draw.stop();
			draw = undefined;
		}

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
				syncEditedGeometryFromSnapshot();
				return;
			}
			mergeDrawnGeometry();
		});
	};

	/** Merge drawn polygons into the current clippingOptions and notify the parent. */
	const mergeDrawnGeometry = () => {
		if (!draw || !$map) return;
		const snapshot = draw.getSnapshot();
		const newPolygons = snapshot.filter(
			(f): f is GeoJSONStoreFeatures<Polygon> => f.geometry.type === 'Polygon'
		);
		if (newPolygons.length === 0) return;

		drawnFeatures = [...drawnFeatures, ...newPolygons];
		saveDrawnFeatures();

		draw.clear();
		exitDrawingMode(true);
		rebuildClippingOptions();
	};

	const syncEditedGeometryFromSnapshot = () => {
		if (!draw || !$map) return;
		drawnFeatures = draw
			.getSnapshot()
			.filter((f): f is GeoJSONStoreFeatures<Polygon> => f.geometry.type === 'Polygon');
		saveDrawnFeatures();
		rebuildClippingOptions();
	};

	const loadDrawnFeaturesIntoDraw = () => {
		if (!draw || !$map) return;
		draw.clear();
		if (drawnFeatures.length > 0) {
			draw.addFeatures(drawnFeatures);
		}
	};

	/**
	 * Rebuild clippingOptions from both country geojson and drawn features.
	 * Called when either source changes.
	 */
	export const rebuildClippingOptions = async () => {
		// Collect country features from the stored country clipping
		let countryFeatures: GeoJsonFeature[] = [];
		const cg = countryClipping?.geojson;
		if (cg) {
			if ('features' in cg) {
				countryFeatures = cg.features;
			} else if (cg.type === 'Feature') {
				countryFeatures = [cg];
			} else {
				countryFeatures = [{ type: 'Feature', properties: null, geometry: cg }];
			}
		}

		const drawnGeoJsonFeatures: GeoJsonFeature[] = drawnFeatures.map((feature) => ({
			type: 'Feature' as const,
			properties: {},
			geometry: feature.geometry as GeoJsonGeometry
		}));
		const allFeatures = [...countryFeatures, ...drawnGeoJsonFeatures];
		if (allFeatures.length === 0) {
			omProtocolSettings.update((s) => ({ ...s, clippingOptions: undefined }));
		} else {
			omProtocolSettings.update((s) => ({
				...s,
				clippingOptions: {
					fillRule,
					geojson: {
						type: 'FeatureCollection' as const,
						features: allFeatures
					}
				}
			}));
		}

		await tick();
		await changeOMfileURL();
		if ($map) $map.fire('dataloading');
	};

	/** Called by the parent when country selection produces new clipping. */
	export const setCountryClipping = (clipping: ClippingOptions) => {
		countryClipping = clipping;
		rebuildClippingOptions();
	};

	const handleCountrySelect = (countries: Country[]) => {
		updateUrl(CLIP_COUNTRIES_PARAM, serializeClipCountriesParam($clippingCountryCodes));
		const nextClipping = buildCountryClippingOptions(countries);
		setCountryClipping(nextClipping);
	};

	/** Import external polygon features (e.g. from a dropped GeoJSON file). */
	export const addImportedFeatures = (features: GeoJsonFeature[]) => {
		const imported: GeoJSONStoreFeatures<Polygon>[] = features
			.filter((f) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon')
			.flatMap((f, i) => {
				if (f.geometry?.type === 'MultiPolygon') {
					const coords = (f.geometry as { coordinates: number[][][][] }).coordinates;
					return coords.map((polygon, j) => ({
						id: `import-${Date.now()}-${i}-${j}`,
						type: 'Feature' as const,
						properties: { mode: 'polygon' },
						geometry: { type: 'Polygon' as const, coordinates: polygon }
					}));
				}
				return [
					{
						id: `import-${Date.now()}-${i}`,
						type: 'Feature' as const,
						properties: { mode: 'polygon' },
						geometry: f.geometry as Polygon
					}
				];
			});
		if (imported.length === 0) return;
		drawnFeatures = [...drawnFeatures, ...imported];
		saveDrawnFeatures();
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
			setTimeout(() => terraDrawActive.set(false), 50);
		} else {
			terraDrawActive.set(false);
		}
		$map?.getCanvas().style.removeProperty('cursor');
	};

	const toggleFillRule = () => {
		fillRule = fillRule === 'nonzero' ? 'evenodd' : 'nonzero';
		if (browser) localStorage.setItem(FILL_RULE_KEY, fillRule);
		rebuildClippingOptions();
	};

	const clearDrawings = () => {
		if (!draw || !$map) return;
		draw.clear();
		drawnFeatures = [];
		saveDrawnFeatures();
		exitDrawingMode();
		countryClipping = undefined;
		countrySelectorRef?.clearAll();
		fillRule = 'nonzero';
		if (browser) localStorage.removeItem(FILL_RULE_KEY);
		rebuildClippingOptions();
	};

	const handleEscapeKeydown = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			exitDrawingMode();
		}
	};

	// Auto-open the panel when country codes appear from URL parsing
	// (parent's onMount runs urlParamsToPreferences after this component mounts)
	$effect(() => {
		if ($clippingCountryCodes.length > 0 && !untrack(() => $clippingPanelOpen)) {
			$clippingPanelOpen = true;
		}
	});

	onMount(async () => {
		if (browser) {
			window.addEventListener('keydown', handleEscapeKeydown, true);

			// Ensure drawn features are loaded from localStorage (SSR/hydration safety)
			if (drawnFeatures.length === 0) {
				drawnFeatures = loadDrawnFeatures();
			}

			if (drawnFeatures.length > 0) {
				$clippingPanelOpen = true;
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
		setTimeout(() => terraDrawActive.set(false), 50);
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
					class="inline-flex border-2 border-primary/50 cursor-pointer h-8 w-8 items-center justify-center rounded-md transition-colors
						{activeMode === 'polygon'
						? 'bg-primary text-primary-foreground border-primary'
						: 'bg-secondary text-secondary-foreground hover:bg-accent'}"
					title="Draw polygon"
					onclick={() => setMode('polygon')}
				>
					<PentagonIcon class="h-4 w-4" />
				</button>
				<button
					class="inline-flex border-2 border-primary/50 cursor-pointer h-8 w-8 items-center justify-center rounded-md transition-colors
						{activeMode === 'rectangle'
						? 'bg-primary text-primary-foreground border-primary'
						: 'bg-secondary text-secondary-foreground hover:bg-accent'}"
					title="Draw rectangle"
					onclick={() => setMode('rectangle')}
				>
					<SquareIcon class="h-4 w-4" />
				</button>
				<button
					class="inline-flex border-2 border-primary/50 cursor-pointer h-8 w-8 items-center justify-center rounded-md transition-colors
						{activeMode === 'freehand'
						? 'bg-primary text-primary-foreground border-primary'
						: 'bg-secondary text-secondary-foreground  hover:bg-accent'}"
					title="Draw freehand"
					onclick={() => setMode('freehand')}
				>
					<SplineIcon class="h-4 w-4" />
				</button>
				<button
					class="inline-flex border-2 border-primary/50 cursor-pointer h-8 w-8 items-center justify-center rounded-md transition-colors
						{activeMode === 'select'
						? 'bg-primary text-primary-foreground border-primary'
						: 'bg-secondary text-secondary-foreground  hover:bg-accent'}"
					title="Select & edit"
					onclick={() => setMode('select')}
				>
					<MousePointerIcon class="h-4 w-4" />
				</button>
				<button
					class="inline-flex border-2 cursor-pointer h-8 items-center justify-center rounded-md px-1.5 text-xs font-semibold transition-colors
						{fillRule === 'evenodd'
						? 'bg-primary text-primary-foreground border-primary'
						: 'bg-secondary text-secondary-foreground border-primary/50 hover:bg-accent'}"
					title={fillRule === 'evenodd'
						? 'Fill rule: even-odd (holes excluded)'
						: 'Fill rule: non-zero (all rings filled)'}
					onclick={toggleFillRule}
				>
					<PaintbrushIcon class="h-4 w-4" />
				</button>
				<button
					class="inline-flex border-2 border-transparent {drawnFeatures.length > 0 ||
					$clippingCountryCodes.length > 0
						? 'bg-destructive/10 text-destructive-foreground border-destructive'
						: 'bg-secondary/10 text-secondary-foreground border-secondary hover:bg-accent'} cursor-pointer h-8 w-8 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
					title="Clear drawings"
					onclick={clearDrawings}
				>
					<Trash2Icon class="h-4 w-4" />
				</button>
			</div>
		</div>
		<CountrySelector bind:this={countrySelectorRef} onselect={handleCountrySelect} />
	</div>
{/if}
