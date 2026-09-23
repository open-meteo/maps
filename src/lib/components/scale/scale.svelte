<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';

	import { getColorScale } from '@openmeteo/weather-map-layer';
	import { mode } from 'mode-watcher';

	import { chartSources } from '$lib/stores/chart';
	import { customColorScales } from '$lib/stores/om-protocol-settings';
	import { preferences } from '$lib/stores/preferences';
	import { variable } from '$lib/stores/variables';

	import { variableLabel } from '$lib/components/selection/selection-utils';

	import ScaleLegend from './scale-legend.svelte';

	interface Props {
		editable?: boolean;
	}

	let { editable = true }: Props = $props();

	const desktop = new MediaQuery('min-width: 768px');

	// One legend per distinct colour scale among the raster sources (primary
	// first): variables resolving to the same scale, e.g. temperature at two
	// levels, share a legend. A chart without any raster still gets the primary
	// variable's legend so units stay visible.
	const legends = $derived.by(() => {
		const rasters = $chartSources.filter((source) => source.raster).map((s) => s.variable);
		const ordered = rasters.length
			? [...rasters].sort((a, b) => (a === $variable ? -1 : b === $variable ? 1 : 0))
			: [$variable];
		const isDark = mode.current === 'dark';
		const groups: { key: string; variables: string[] }[] = [];
		for (const v of ordered) {
			// Resolved scales are fresh objects, so compare by content
			const key = JSON.stringify($customColorScales[v] ?? getColorScale(v, isDark));
			const group = groups.find((g) => g.key === key);
			if (group) group.variables.push(v);
			else groups.push({ key, variables: [v] });
		}
		return groups.map((group) => group.variables);
	});

	// With several sources each legend names its variables; on mobile
	// multiple legends switch to the compact size.
	const showLabels = $derived(legends.length > 1 || $chartSources.length > 1);
	const compact = $derived(!desktop.current && legends.length > 1);
</script>

{#if $preferences.showScale}
	<div
		class="absolute z-60 {!desktop.current
			? 'bottom-22.5'
			: 'bottom-2.5'} duration-500 left-2.5 z-10 flex items-end gap-0.5"
	>
		{#each legends as variables (variables[0])}
			<ScaleLegend
				{variables}
				{editable}
				{compact}
				labels={showLabels ? variables.map(variableLabel) : undefined}
			/>
		{/each}
	</div>
{/if}
