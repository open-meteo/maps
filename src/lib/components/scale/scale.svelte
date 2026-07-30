<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';

	import { chartSources } from '$lib/stores/chart';
	import { preferences } from '$lib/stores/preferences';
	import { variable } from '$lib/stores/variables';

	import ScaleLegend from './scale-legend.svelte';

	interface Props {
		editable?: boolean;
	}

	let { editable = true }: Props = $props();

	const desktop = new MediaQuery('min-width: 768px');

	// One legend per raster source (primary first); a chart without any raster
	// still gets the primary variable's legend so units stay visible.
	const legendVariables = $derived.by(() => {
		const rasters = $chartSources.filter((source) => source.raster).map((s) => s.variable);
		if (!rasters.length) return [$variable];
		return [...rasters].sort((a, b) => (a === $variable ? -1 : b === $variable ? 1 : 0));
	});
</script>

{#if $preferences.showScale}
	<div
		class="absolute z-60 {!desktop.current
			? 'bottom-22.5'
			: 'bottom-2.5'} duration-500 left-2.5 z-10 flex items-end gap-1.5"
	>
		{#each legendVariables as legendVariable (legendVariable)}
			<ScaleLegend variable={legendVariable} {editable} />
		{/each}
	</div>
{/if}
