<script lang="ts">
	import { getColorScale } from '$lib/utils/color-scales';

	import type { Variables } from '$lib/types';

	interface Props {
		showScale: boolean;
		variables: Variables;
	}

	let { showScale, variables }: Props = $props();

	let colorScale = $derived.by(() => {
		return getColorScale(variables[0].value);
	});
</script>

{#if showScale}
	<div class="absolute bottom-2.5 left-2.5 z-10 max-h-[300px]">
		<div
			style="box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 0px 2px;"
			class="flex flex-col-reverse overflow-hidden rounded-[4px]"
		>
			<div class="flex max-h-[275px] flex-col">
				{#each colorScale.colors as cs, i (i)}
					<div
						style={'background: rgba(' +
							cs.join(',') +
							`); width: 25px; height:${275 / ((colorScale.max - colorScale.min) * colorScale.scalefactor)}px;`}
					></div>
				{/each}

				{#each [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as step, i (i)}
					<div
						class="absolute w-[25px] text-center text-xs text-white"
						style={'bottom: ' + (2 + 275 * step * 0.0093) + 'px;'}
					>
						{(colorScale.min + step * 0.01 * (colorScale.max - colorScale.min)).toFixed(0)}
					</div>
				{/each}
			</div>
			{#if colorScale.unit}
				<div
					class="bg-background/90 dark:bg-background/70 h-[20px] w-[25px] py-1 text-center text-xs"
				>
					{colorScale.unit}
				</div>
			{/if}
		</div>
	</div>
{/if}
