<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';

	import { getColorScale } from '@openmeteo/weather-map-layer';
	import { mode } from 'mode-watcher';

	import { chartSources } from '#lib/stores/chart.js';
	import { customColorScales } from '#lib/stores/om-protocol-settings.js';
	import { preferences } from '#lib/stores/preferences.js';
	import { variable } from '#lib/stores/variables.js';

	import { variableLabel } from '#lib/components/selection/selection-utils.js';

	import { sourceShowsContours } from '#lib/chart-types.js';
	import { RAIN_SNOW, UNKNOWN_PHASE_COLOR } from '#lib/precipitation-phase/model.js';
	import {
		PHASE_CONTOUR_COLOR,
		PHASE_CONTOUR_HALO_COLOR
	} from '#lib/precipitation-phase/phase-contour.js';

	import ScaleLegend from './scale-legend.svelte';

	const desktop = new MediaQuery('min-width: 768px');
	const snowSwatch =
		'repeating-linear-gradient(135deg, #7099bb 0 4px, #1c3652 4px 5px, white 5px 8px, #1c3652 8px 9px)';

	// One legend per distinct colour scale among the raster sources (primary
	// first): variables resolving to the same scale, e.g. temperature at two
	// levels, share a legend. A chart without any raster still gets the primary
	// variable's legend so units stay visible.
	const legends = $derived.by(() => {
		const rasters = $chartSources
			.filter(
				(source) => source.raster || (source.variable === RAIN_SNOW && sourceShowsContours(source))
			)
			.map((source) => source.variable);
		const ordered = rasters.length
			? [...rasters].sort((a, b) => (a === $variable ? -1 : b === $variable ? 1 : 0))
			: [$variable];
		const isDark = mode.current === 'dark';
		const groups: { key: string; variables: string[] }[] = [];
		for (const v of ordered) {
			// Resolved scales are fresh objects, so compare by content
			const key =
				v === RAIN_SNOW ? v : JSON.stringify($customColorScales[v] ?? getColorScale(v, isDark));
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
			: 'bottom-2.5'} left-2.5 flex items-end gap-0.5"
	>
		{#each legends as variables (variables[0])}
			{#if variables[0] === RAIN_SNOW}
				{@const phase = $chartSources.find((source) => source.variable === RAIN_SNOW)}
				{@const boundary = phase && sourceShowsContours(phase)}
				<div class="flex items-end gap-1">
					{#if phase?.raster}<ScaleLegend variables={['precipitation']} {compact} />{/if}
					{#if phase?.raster || boundary}
						<div
							class="bg-glass/90 flex flex-col gap-1 rounded px-2 py-1 text-xs shadow-sm backdrop-blur-sm"
						>
							{#if phase?.raster}
								<div class="flex items-center gap-1.5">
									<span aria-hidden="true" class="h-3 w-4 rounded-sm" style:background={snowSwatch}
									></span>
									Snow
								</div>
								<div class="flex items-center gap-1.5">
									<span
										aria-hidden="true"
										class="h-3 w-4 rounded-sm"
										style:background-color={`rgb(${UNKNOWN_PHASE_COLOR.join(' ')})`}
									></span>
									Phase unknown
								</div>
							{/if}
							{#if boundary}
								<div class="flex items-center gap-1.5">
									<span
										aria-hidden="true"
										class="h-[3px] w-4 rounded-sm"
										style:background={PHASE_CONTOUR_COLOR}
										style:box-shadow={`0 0 0 1px ${PHASE_CONTOUR_HALO_COLOR}`}
									></span>
									Rain–snow boundary
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{:else}
				<ScaleLegend
					{variables}
					{compact}
					labels={showLabels ? variables.map(variableLabel) : undefined}
				/>
			{/if}
		{/each}
	</div>
{/if}
