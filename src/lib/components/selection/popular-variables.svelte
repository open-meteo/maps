<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';

	import {
		activeChart,
		applyPreset,
		isDefaultsPlainChart,
		setPlainVariable
	} from '$lib/stores/chart';
	import { metaJson } from '$lib/stores/time';
	import { levelGroupSelected, variable } from '$lib/stores/variables';

	import { getChartPreset, popularVariables } from '$lib/chart-presets';

	import LevelSelect from './level-select.svelte';
	import { buildLevelGroups, pickDefaultLevel, variableLabel } from './selection-utils';

	interface Props {
		/** Popular entry id whose row hosts the nested level selector. */
		levelHostId?: string;
	}

	let { levelHostId = undefined }: Props = $props();

	const levelGroups = $derived($metaJson ? buildLevelGroups($metaJson.variables) : {});

	interface PopularEntry {
		id: string;
		label: string;
		target: string;
		levelGroup: boolean;
		presetId?: string;
	}

	// Popular entries the current domain actually serves; level groups resolve
	// to their preferred level variant on click, preset-backed rows apply
	// their chart preset instead of a plain variable.
	const entries = $derived.by(() => {
		if (!$metaJson) return [];
		const available: PopularEntry[] = [];
		for (const entry of popularVariables) {
			if (entry.presetId) {
				const preset = getChartPreset(entry.presetId);
				if (
					preset &&
					preset.sources.every((source) => $metaJson.variables.includes(source.variable))
				) {
					available.push({
						id: entry.id,
						label: entry.label ?? preset.label,
						target: '',
						levelGroup: false,
						presetId: entry.presetId
					});
				}
			} else if (entry.levelGroup) {
				const target = levelGroups[entry.id]
					? pickDefaultLevel(levelGroups[entry.id], entry.defaultLevel)
					: undefined;
				if (target) {
					available.push({
						id: entry.id,
						label: entry.label ?? variableLabel(entry.id),
						target,
						levelGroup: true
					});
				}
			} else if ($metaJson.variables.includes(entry.id)) {
				available.push({
					id: entry.id,
					label: entry.label ?? variableLabel(entry.id),
					target: entry.id,
					levelGroup: false
				});
			}
		}
		return available;
	});

	// A level-group row stays active on any of its levels, so the nested level
	// selector remains in place when another pressure/height level is picked.
	const isActive = (entry: PopularEntry): boolean => {
		if (entry.presetId) return $activeChart.presetId === entry.presetId;
		if (!isDefaultsPlainChart($activeChart)) return false;
		if (entry.levelGroup) return $levelGroupSelected?.value === entry.id;
		return $variable === entry.id;
	};

	const select = (entry: PopularEntry): void => {
		if (entry.presetId) {
			applyPreset(entry.presetId);
		} else {
			setPlainVariable(entry.target);
		}
	};
</script>

{#if entries.length}
	<div class="flex flex-col py-1">
		{#each entries as entry (entry.id)}
			{@const active = isActive(entry)}
			<button
				class="hover:bg-primary/10 flex h-7.5 w-full cursor-pointer items-center justify-between px-3 text-sm {active
					? 'bg-primary/10'
					: ''}"
				onclick={() => {
					if (!active) select(entry);
				}}
			>
				<div class="truncate text-left">{entry.label}</div>
				<CheckIcon class="size-4 shrink-0 {active ? '' : 'text-transparent'}" />
			</button>
			{#if levelHostId === entry.id}
				<LevelSelect nested />
			{/if}
		{/each}
	</div>
{/if}
