<script lang="ts">
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { toast } from 'svelte-sonner';

	import { clippingPanelOpen } from '$lib/stores/clipping';

	import type { GeoJsonFeature, GeoJsonGeometry } from '@openmeteo/weather-map-layer';

	interface Props {
		ondrop?: (features: GeoJsonFeature[]) => void;
	}

	let { ondrop }: Props = $props();

	let dragging = $state(false);
	let dragCounter = 0;

	const ACCEPTED_EXTENSIONS = ['.geojson', '.json'];

	const isAcceptedFile = (file: File): boolean => {
		const name = file.name.toLowerCase();
		return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
	};

	const isPolygonGeometry = (type: string): boolean =>
		type === 'Polygon' || type === 'MultiPolygon';

	const extractFeatures = (geojson: unknown): GeoJsonFeature[] => {
		if (!geojson || typeof geojson !== 'object' || !('type' in geojson)) return [];
		const obj = geojson as Record<string, unknown>;

		if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
			return (obj.features as Record<string, unknown>[])
				.filter(
					(f) =>
						f.type === 'Feature' &&
						f.geometry &&
						typeof f.geometry === 'object' &&
						'type' in (f.geometry as object) &&
						isPolygonGeometry((f.geometry as { type: string }).type)
				)
				.map((f) => ({
					type: 'Feature' as const,
					properties: (f.properties as Record<string, unknown>) ?? {},
					geometry: f.geometry as GeoJsonGeometry
				}));
		}

		if (obj.type === 'Feature' && obj.geometry && typeof obj.geometry === 'object') {
			const geom = obj.geometry as { type: string };
			if (isPolygonGeometry(geom.type)) {
				return [
					{
						type: 'Feature' as const,
						properties: (obj.properties as Record<string, unknown>) ?? {},
						geometry: obj.geometry as GeoJsonGeometry
					}
				];
			}
			return [];
		}

		if (isPolygonGeometry(obj.type as string)) {
			return [
				{
					type: 'Feature' as const,
					properties: {},
					geometry: geojson as GeoJsonGeometry
				}
			];
		}

		if (obj.type === 'GeometryCollection' && Array.isArray(obj.geometries)) {
			const polygons = (obj.geometries as { type: string }[]).filter((g) =>
				isPolygonGeometry(g.type)
			);
			if (polygons.length === 0) return [];
			return polygons.map((g) => ({
				type: 'Feature' as const,
				properties: {},
				geometry: g as GeoJsonGeometry
			}));
		}

		return [];
	};

	const processFile = async (file: File): Promise<void> => {
		const text = await file.text();
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			toast.error(`Invalid JSON: ${file.name}`);
			return;
		}

		const features = extractFeatures(parsed);
		if (features.length === 0) {
			toast.warning(`No polygon geometries found in ${file.name}`);
			return;
		}

		toast.success(
			`Loaded ${features.length} polygon${features.length > 1 ? 's' : ''} from ${file.name}`
		);
		$clippingPanelOpen = true;
		ondrop?.(features);
	};

	const handleDragEnter = (e: DragEvent) => {
		e.preventDefault();
		dragCounter++;
		dragging = true;
	};

	const handleDragOver = (e: DragEvent) => {
		e.preventDefault();
	};

	const handleDragLeave = (e: DragEvent) => {
		e.preventDefault();
		dragCounter--;
		if (dragCounter <= 0) {
			dragCounter = 0;
			dragging = false;
		}
	};

	const handleDrop = async (e: DragEvent) => {
		e.preventDefault();
		dragCounter = 0;
		dragging = false;

		const files = e.dataTransfer?.files;
		if (!files || files.length === 0) return;

		for (const file of Array.from(files)) {
			if (isAcceptedFile(file)) {
				await processFile(file);
			} else {
				toast.warning(`Unsupported file type: ${file.name}`);
			}
		}
	};
</script>

<svelte:document
	ondragenter={handleDragEnter}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
/>

{#if dragging}
	<div
		class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-xs"
	>
		<div
			class="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary bg-background/80 px-12 py-10 shadow-lg"
		>
			<UploadIcon class="h-10 w-10 text-primary" />
			<p class="text-lg font-semibold text-foreground">Drop file to process</p>
			<p class="text-sm text-muted-foreground">'.geojson' or '.json' files supported</p>
		</div>
	</div>
{/if}
