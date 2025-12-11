<script lang="ts">
	import { type RGBAColorScale, getColor, getColorScale } from '@openmeteo/mapbox-layer';
	import { mode } from 'mode-watcher';

	import { variable } from '$lib/stores/preferences';

	import { textWhite } from '$lib';

	interface Props {
		showScale: boolean;
		timeSelector: boolean;
	}

	let { showScale, timeSelector }: Props = $props();

	const isDark = $derived(mode.current === 'dark');
	const colorScale: RGBAColorScale = $derived(getColorScale($variable, isDark));

	const colorScaleHeight = 500;
	const amountLabels = 25;
</script>

{#if showScale}
	{@const digits = Math.abs(Math.floor(1 / Math.log(colorScale.max - colorScale.min)))}

	<div
		class="absolute {timeSelector
			? 'bottom-27.5'
			: 'bottom-2.5'} left-2.5 z-10 duration-500 max-h-[{colorScaleHeight + 100}px]"
	>
		<div
			style="box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 0px 2px;"
			class="flex flex-col-reverse overflow-hidden rounded-[4px]"
		>
			<div
				class="flex max-h-[{colorScaleHeight}px] flex-col-reverse"
				style={isDark ? 'background:black;' : 'background:white;'}
			>
				{#each colorScale.colors as cs, i (i)}
					{@const valueLength = String(Math.round(colorScale.max)).length}
					{@const width = 17 + Math.max(valueLength, colorScale.unit.length + 1, digits + 2) * 4}
					<div
						style={`background: rgba(${cs.join(',')});min-width: 28px; width: ${width}px; height: ${colorScaleHeight / colorScale.colors.length}px;`}
					></div>
				{/each}

				{#each Array.from({ length: amountLabels + 1 }, (_, i) => i / amountLabels) as step, i (i)}
					{@const value = Math.floor(colorScale.min + step * (colorScale.max - colorScale.min))}
					{@const color = getColor(colorScale, value)}

					<div
						class="absolute w-full text-center text-xs"
						style={`bottom:  ${2 + (colorScaleHeight * step * amountLabels) / (amountLabels + 1)}px; color: ${textWhite(color, isDark) ? 'white;' : 'black'}`}
					>
						{value.toFixed(digits)}
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
