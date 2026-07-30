<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import { levelGroupVariables } from '@openmeteo/weather-map-layer';

	import {
		activeChart,
		applyPreset,
		applySavedChart,
		savedCharts,
		setPlainVariable
	} from '$lib/stores/chart';
	import { metaJson } from '$lib/stores/time';
	import { levelGroupSelected, variable } from '$lib/stores/variables';

	import * as Command from '$lib/components/ui/command';

	import { chartPresets } from '$lib/chart-presets';

	import {
		buildLevelGroups,
		buildVariableList,
		pickDefaultLevel,
		variableLabel
	} from './selection-utils';

	interface Props {
		/** Called after a result was applied (clears the search query). */
		onDone: () => void;
	}

	let { onDone }: Props = $props();

	const variableList = $derived($metaJson ? buildVariableList($metaJson.variables) : []);
	const levelGroups = $derived($metaJson ? buildLevelGroups($metaJson.variables) : {});

	const availablePresets = $derived(
		$metaJson
			? chartPresets.filter((preset) =>
					preset.sources.every((source) => $metaJson.variables.includes(source.variable))
				)
			: []
	);
	const availableSavedCharts = $derived(
		$metaJson
			? $savedCharts.charts.filter((chart) =>
					chart.sources.every((source) => $metaJson.variables.includes(source.variable))
				)
			: []
	);

	const selectVariable = (entry: string) => {
		if (levelGroupVariables.includes(entry) && levelGroups[entry]) {
			const target = pickDefaultLevel(levelGroups[entry]);
			if (target) setPlainVariable(target);
		} else {
			setPlainVariable(entry);
		}
		onDone();
	};

	const isVariableActive = (entry: string): boolean =>
		levelGroupVariables.includes(entry)
			? $levelGroupSelected?.value === entry
			: $variable === entry;
</script>

<Command.List class="max-h-full">
	<Command.Empty>Nothing found.</Command.Empty>
	{#if availableSavedCharts.length || availablePresets.length}
		<Command.Group heading="Charts">
			{#each availableSavedCharts as chart (chart.id)}
				{@const active = $activeChart.name === chart.name}
				<Command.Item
					value={chart.id}
					keywords={[chart.name]}
					class="hover:bg-primary/20! cursor-pointer {active ? 'bg-primary/10!' : ''}"
					onSelect={() => {
						applySavedChart(chart.id);
						onDone();
					}}
				>
					<div class="flex w-full items-center justify-between">
						{chart.name}
						<CheckIcon class="size-4 shrink-0 {active ? '' : 'text-transparent'}" />
					</div>
				</Command.Item>
			{/each}
			{#each availablePresets as preset (preset.id)}
				{@const active = $activeChart.presetId === preset.id}
				<Command.Item
					value={preset.id}
					keywords={[preset.label, preset.group ?? '', preset.description ?? '']}
					class="hover:bg-primary/20! cursor-pointer {active ? 'bg-primary/10!' : ''}"
					onSelect={() => {
						applyPreset(preset.id);
						onDone();
					}}
				>
					<div class="flex w-full items-center justify-between gap-1.5">
						<div class="min-w-0">
							<div class="truncate">{preset.label}</div>
							{#if preset.description}
								<div class="text-muted-foreground truncate text-[11px]">{preset.description}</div>
							{/if}
						</div>
						<CheckIcon class="size-4 shrink-0 {active ? '' : 'text-transparent'}" />
					</div>
				</Command.Item>
			{/each}
		</Command.Group>
	{/if}
	<Command.Group heading="Variables">
		{#each variableList as entry (entry)}
			{#if levelGroupVariables.includes(entry) || (!entry.includes('_v_') && !entry.includes('_direction'))}
				{@const active = isVariableActive(entry)}
				<Command.Item
					value={entry}
					keywords={[variableLabel(entry)]}
					class="hover:bg-primary/20! cursor-pointer {active ? 'bg-primary/10!' : ''}"
					onSelect={() => selectVariable(entry)}
				>
					<div class="flex w-full items-center justify-between">
						{variableLabel(entry)}
						<CheckIcon class="size-4 shrink-0 {active ? '' : 'text-transparent'}" />
					</div>
				</Command.Item>
			{/if}
		{/each}
	</Command.Group>
</Command.List>
