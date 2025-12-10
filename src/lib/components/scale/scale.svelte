<script lang="ts">
	import { type RenderableColorScale, getColor, getColorScale } from '@openmeteo/mapbox-layer';
	import { mode } from 'mode-watcher';

	import { variable } from '$lib/stores/preferences';

	import { textWhite } from '$lib';

	interface Props {
		showScale: boolean;
	}

	let { showScale }: Props = $props();

	const colorScaleHeight = 500;

	const isDark = $derived(mode.current === 'dark');
	const colorScale: RenderableColorScale = $derived(getColorScale($variable, isDark));

	const getLabeledColorsForLegend = (colorScale: RenderableColorScale) => {
		const labeledColors = [];
		switch (colorScale.type) {
			case 'rgba': {
				const amountLabels = 25;
				const step = (colorScale.max - colorScale.min) / amountLabels;

				for (let i = 0; i <= amountLabels; i++) {
					const value = Math.floor(colorScale.min + i * step);
					const color = getColor(colorScale, value);
					labeledColors.push({ value, color });
				}
				return labeledColors;
			}
			case 'breakpoint': {
				for (let i = 0; i < colorScale.breakpoints.length; i++) {
					const value = colorScale.breakpoints[i];
					const color = colorScale.colors[i];
					labeledColors.push({ value, color });
				}
				return labeledColors;
			}
		}
	};
</script>

{#if showScale}
	{@const digits = 2}
	{@const valueLength = String(Math.round(colorScale.max)).length}
	{@const width = 17 + Math.max(valueLength, colorScale.unit.length + 1, digits + 2) * 4}
	{@const labeledColors = getLabeledColorsForLegend(colorScale)}
	{@const amountLabels = labeledColors.length}
	<div class="absolute bottom-2.5 left-2.5 z-10 max-h-[{colorScaleHeight + 100}px]">
		<div
			style="box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 0px 2px;"
			class="flex flex-col-reverse overflow-hidden rounded-[4px]"
		>
			<div
				class="flex max-h-[{colorScaleHeight}px] flex-col-reverse"
				style={isDark ? 'background:black;' : 'background:white;'}
			>
				{#each labeledColors as lc, i (lc)}
					<div
						style={`background: rgba(${lc.color.join(',')});min-width: 28px; width: ${width}px; height: ${colorScaleHeight / amountLabels}px;`}
					></div>
					<div
						class="absolute w-full text-center text-xs"
						style={`bottom:  ${2 + (colorScaleHeight / amountLabels) * i}px; color: ${textWhite(lc.color, isDark) ? 'white;' : 'black'}`}
					>
						{#if lc.value >= 1 || lc.value <= -1}
							{lc.value.toFixed(0)}
						{:else if lc.value >= 0.1 || lc.value <= -0.1}
							{lc.value.toFixed(1)}
						{:else}
							{lc.value.toFixed(digits)}
						{/if}
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
