<script lang="ts">
	import { getColorScale } from '$lib/utils/color-scales';

	import type { Variable } from '$lib/types';

	interface Props {
		showScale: boolean;
		variable: Variable;
	}

	let { showScale, variable }: Props = $props();

	let colorScale = $derived.by(() => {
		return getColorScale(variable);
	});
</script>

<div class="flex flex-col-reverse rounded-b-md">
	{#if showScale}
		{#each colorScale.colors as cs, i (i)}
			<div
				style={'background: rgba(' +
					cs.join(',') +
					`); width: 25px; height:${300 / (colorScale.max - colorScale.min)}px;`}
			></div>
		{/each}

		{#each [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as step, i (i)}
			<div
				class="absolute w-[25px] text-center text-xs text-white"
				style={'bottom: ' + (2 + 298 * step * 0.0093) + 'px;'}
			>
				{(colorScale.min + step * 0.01 * (colorScale.max - colorScale.min)).toFixed(0)}
			</div>
		{/each}
		{#if colorScale.unit}
			<div
				class="bg-background absolute top-[-20px] w-[25px] rounded-t-sm py-1 text-center text-xs"
			>
				{colorScale.unit}
			</div>
		{/if}
	{/if}
</div>
