<script lang="ts">
	import { getColor, getOpacity } from '@openmeteo/mapbox-layer';
	import { mode } from 'mode-watcher';

	import { colorScale as cS } from '$lib/stores/preferences';

	import { textWhite } from '$lib';

	interface Props {
		showScale: boolean;
		variable: string;
	}

	let { showScale, variable }: Props = $props();

	const colorScale = $derived.by(() => $cS);
	const colorScaleHeight = 800;
	const amountLabels = 45;
</script>

{#if showScale}
	<div class="absolute bottom-2.5 left-2.5 z-10 max-h-[{colorScaleHeight + 100}px]">
		<div
			style="box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 0px 2px;"
			class="flex flex-col-reverse overflow-hidden rounded-[4px]"
		>
			<div
				class="flex max-h-[{colorScaleHeight}px] flex-col-reverse"
				style={mode.current === 'dark' ? 'background:black;' : 'background:white;'}
			>
				{#each colorScale.colors as cs, i (i)}
					{@const digits = Math.floor(1 / Math.log(colorScale.max - colorScale.min))}
					{@const value =
						colorScale.min +
						(i / (colorScale.colors.length - 1)) * (colorScale.max - colorScale.min)}
					{@const opacity = getOpacity(variable, value, mode.current === 'dark', colorScale) / 255}
					<div
						style={`background: rgba(${cs.join(',')}); filter: opacity(${opacity});min-width: 28px; width: ${17 + Math.max(String(Math.round(colorScale.max)).length, colorScale.unit.length + 1, digits + 2) * 4}px; height: ${colorScaleHeight / colorScale.colors.length}px;`}
					></div>
				{/each}

				{#each Array.from({ length: amountLabels + 1 }, (_, i) => (i * 100) / amountLabels) as step, i (i)}
					{@const digits = Math.floor(1 / Math.log(colorScale.max - colorScale.min))}
					{@const color = getColor(
						colorScale,
						Math.floor(
							colorScale.min + (step * (colorScale.max - colorScale.min)) / colorScale.colors.length
						)
					) as [number, number, number]}
					{@const opacity =
						getOpacity(
							variable,
							colorScale.min + step * 0.01 * (colorScale.max - colorScale.min),
							mode.current === 'dark',
							colorScale
						) / 255}

					<div
						class="absolute w-full text-center text-xs"
						style={`bottom:  ${2 + (colorScaleHeight * step * 0.01 * amountLabels) / (amountLabels + 1)}px; color: ${textWhite(color, opacity, mode.current === 'dark') ? 'white;' : 'black'}`}
					>
						{(colorScale.min + step * 0.01 * (colorScale.max - colorScale.min)).toFixed(digits)}
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
