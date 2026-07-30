<script lang="ts">
	import LayersIcon from '@lucide/svelte/icons/layers';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SaveIcon from '@lucide/svelte/icons/save';
	import WavesIcon from '@lucide/svelte/icons/waves';
	import WindIcon from '@lucide/svelte/icons/wind';
	import XIcon from '@lucide/svelte/icons/x';

	import { activeChart, removeSource, saveCurrentChart, updateSource } from '$lib/stores/chart';

	import { Input } from '$lib/components/ui/input';

	import { variableSupportsArrows } from '$lib/chart-encoding';

	import { variableLabel } from './selection-utils';
	import SourceLevelSelect from './source-level-select.svelte';

	import type { ChartSource } from '$lib/chart-types';

	interface Props {
		onAddVariable: () => void;
	}

	let { onAddVariable }: Props = $props();

	let showSaveInput = $state(false);
	let saveName = $state('');

	const layerCount = (source: ChartSource): number =>
		(source.raster ? 1 : 0) + (source.contours ? 1 : 0) + (source.arrows ? 1 : 0);

	const toggle = (index: number, source: ChartSource, key: 'raster' | 'contours' | 'arrows') => {
		// A source must keep at least one layer type enabled
		if (source[key] && layerCount(source) === 1) return;
		updateSource(index, { [key]: !source[key] });
	};

	const submitSave = () => {
		if (!saveName.trim()) return;
		saveCurrentChart(saveName);
		saveName = '';
		showSaveInput = false;
	};

	const toggleClass = (enabled: boolean | undefined): string =>
		enabled ? 'bg-primary/20 opacity-100' : 'opacity-35 hover:opacity-70';

	/** Label without the level suffix; the level chip shows it instead. */
	const baseLabel = (variable: string): string =>
		variableLabel(variable).replace(/\s*\(\d+\s*(?:m|cm|hPa)\)$/, '');

	/**
	 * Interval stepping: whole numbers above 3, halves down to 1, quarters
	 * below, stopping at 0.25 (finer values down to 0.1 can be typed).
	 */
	const stepInterval = (current: number, up: boolean): number => {
		const next = up
			? current >= 3
				? current + 1
				: current >= 1
					? current + 0.5
					: current + 0.25
			: current > 3
				? current - 1
				: current > 1
					? current - 0.5
					: current - 0.25;
		return Math.max(0.25, Math.round(next * 100) / 100);
	};
</script>

<div class="flex flex-col gap-1 py-1 pb-1.5">
	{#each $activeChart.sources as source, i (source.variable)}
		{@const arrowsSupported = variableSupportsArrows(source.variable)}
		<div class="flex h-6 items-center gap-1 pr-1 pl-3 text-sm">
			<div class="truncate" title={source.variable}>
				{baseLabel(source.variable)}
			</div>
			<SourceLevelSelect
				sourceVariable={source.variable}
				onSelect={(newVariable) => updateSource(i, { variable: newVariable })}
			/>
			<div class="ml-auto flex shrink-0 items-center gap-0.5">
				{#if source.contours}
					<Input
						type="number"
						step="any"
						min="0.1"
						class="h-5! bg-background/50 w-9 rounded-sm border-none px-0.5 text-center text-xs! [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
						placeholder="auto"
						title="Contour interval (empty = colorscale breakpoints)"
						value={source.contourInterval ?? ''}
						onkeydown={(e) => {
							if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
							e.preventDefault();
							updateSource(i, {
								contourInterval: stepInterval(source.contourInterval ?? 2, e.key === 'ArrowUp')
							});
						}}
						onchange={(e) => {
							const raw = (e.currentTarget as HTMLInputElement).value;
							const parsed = Number(raw);
							updateSource(i, {
								contourInterval:
									raw === '' || !isFinite(parsed) || parsed <= 0 ? undefined : Math.max(0.1, parsed)
							});
						}}
					/>
				{/if}
				<button
					class="cursor-pointer rounded-sm p-0.5 duration-150 {toggleClass(source.raster)}"
					title="Raster fill"
					aria-pressed={!!source.raster}
					onclick={() => toggle(i, source, 'raster')}
				>
					<LayersIcon class="size-3.5" />
				</button>
				<button
					class="cursor-pointer rounded-sm p-0.5 duration-150 {toggleClass(source.contours)}"
					title="Contour lines"
					aria-pressed={!!source.contours}
					onclick={() => toggle(i, source, 'contours')}
				>
					<WavesIcon class="size-3.5" />
				</button>
				<button
					class="rounded-sm p-0.5 duration-150 {arrowsSupported
						? 'cursor-pointer ' + toggleClass(source.arrows)
						: 'cursor-not-allowed opacity-15'}"
					title={arrowsSupported ? 'Wind arrows' : 'This variable has no direction data for arrows'}
					aria-pressed={!!source.arrows}
					disabled={!arrowsSupported}
					onclick={() => toggle(i, source, 'arrows')}
				>
					<WindIcon class="size-3.5" />
				</button>
				<button
					class="cursor-pointer p-0.5 opacity-40 duration-150 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-10"
					title="Remove from chart"
					aria-label="Remove {source.variable} from chart"
					disabled={$activeChart.sources.length <= 1}
					onclick={() => removeSource(i)}
				>
					<XIcon class="size-3" />
				</button>
			</div>
		</div>
	{/each}

	<div class="flex items-center gap-1.5 px-3 pt-0.5">
		<button
			class="hover:bg-primary/10 bg-primary/5 flex h-6.5 flex-1 cursor-pointer items-center justify-center gap-1 rounded text-xs opacity-90"
			onclick={onAddVariable}
		>
			<PlusIcon class="size-3.5" /> Add variable
		</button>
		<button
			class="hover:bg-primary/10 bg-primary/5 flex h-6.5 flex-1 cursor-pointer items-center justify-center gap-1 rounded text-xs opacity-90"
			onclick={() => (showSaveInput = !showSaveInput)}
		>
			<SaveIcon class="size-3.5" /> Save chart
		</button>
	</div>
	{#if showSaveInput}
		<div class="flex items-center gap-1.5 px-3 pt-0.5">
			<Input
				class="h-6.5! bg-background/50 flex-1 rounded-sm border-none px-1.5 text-xs!"
				placeholder="Chart name..."
				bind:value={saveName}
				onkeydown={(e) => {
					if (e.key === 'Enter') submitSave();
					e.stopPropagation();
				}}
			/>
			<button
				class="hover:bg-primary/10 bg-primary/5 h-6.5 cursor-pointer rounded px-2.5 text-xs"
				onclick={submitSave}
			>
				Save
			</button>
		</div>
	{/if}
</div>
