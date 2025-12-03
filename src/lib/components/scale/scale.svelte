<script lang="ts">
	import { type Variables, getColor, getColorScale, getOpacity } from '@openmeteo/mapbox-layer';
	import { mode } from 'mode-watcher';

	import { textWhite } from '$lib';

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
			<div
				class="flex max-h-[270px] flex-col-reverse"
				style={mode.current === 'dark' ? 'background:black;' : 'background:white;'}
			>
				{#each colorScale.colors as cs, i (i)}
					{@const value =
						colorScale.min +
						(i / (colorScale.colors.length - 1)) * (colorScale.max - colorScale.min)}
					{@const rawOpacity = getOpacity(
						variables[0].value,
						value,
						mode.current === 'dark',
						colorScale
					)}
					{@const opacity = Math.max(0, Math.min(1, rawOpacity))}
					<!-- ensure 0..1 -->
					<div
						style={`background: rgba(${cs[0]}, ${cs[1]}, ${cs[2]}, ${opacity}); min-width: 28px; width: ${17 + String(Math.round(colorScale.max)).length * 4}px; height: ${270 / ((colorScale.max - colorScale.min) * colorScale.scalefactor)}px;`}
					></div>
				{/each}

				{#each [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as step, i (i)}
					{@const color = getColor(
						colorScale,
						Math.floor(
							colorScale.min +
								step *
									(colorScale.scalefactor / colorScale.steps) *
									(colorScale.max - colorScale.min)
						)
					) as [number, number, number]}
					<div
						class="absolute w-full text-center text-xs"
						style={`bottom:  ${2 + 270 * step * 0.0093}px; color: ${textWhite(color) ? 'white;' : 'black'}`}
					>
						{(colorScale.min + step * 0.01 * (colorScale.max - colorScale.min)).toFixed(0)}
					</div>
				{/each}
			</div>
			{#if colorScale.unit}
				<div
					class="bg-background/90 dark:bg-background/70 h-[23px] w-full overflow-hidden py-1 text-center text-xs"
				>
					{colorScale.unit}
				</div>
			{/if}
		</div>
	</div>
{/if}
