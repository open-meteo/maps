<script lang="ts">
	import { slide } from 'svelte/transition';

	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { levelGroupVariables } from '@openmeteo/weather-map-layer';
	import { persisted } from 'svelte-persisted-store';

	import { activeChart, isSingleVariableChart, setPlainVariable } from '$lib/stores/chart';
	import { metaJson } from '$lib/stores/time';
	import { domain, levelGroupSelected, variable } from '$lib/stores/variables';

	import { popularVariables } from '$lib/chart-presets';

	import LevelSelect from './level-select.svelte';
	import {
		buildVariableList,
		isStandaloneVariable,
		levelGroups,
		pickDefaultLevel,
		resolvePopularTarget,
		variableLabel
	} from './selection-utils';

	interface Props {
		/** Entry id whose row hosts the nested level selector. */
		levelHostId?: string;
	}

	let { levelHostId = undefined }: Props = $props();

	const open = persisted('other-variables-open', false);

	// Whether the domain serves any popular entry. Without one there is no
	// "more": the collapsible header disappears and the list renders flat.
	const hasPopular = $derived(
		$metaJson
			? popularVariables.some((entry) =>
					resolvePopularTarget(entry, $metaJson.variables, $levelGroups)
				)
			: false
	);

	// Everything the domain serves that the popular list does not already
	// represent, level-collapsed and alphabetical.
	const entries = $derived.by(() => {
		if (!$metaJson) return [];
		const popularIds = new Set(popularVariables.map((entry) => entry.id));
		const popularPlainIds = new Set(
			popularVariables.filter((entry) => !entry.levelGroup && !entry.presetId).map((e) => e.id)
		);

		const available: { id: string; label: string; target: string }[] = [];
		for (const id of buildVariableList($metaJson.variables)) {
			if (popularIds.has(id)) continue;

			if (levelGroupVariables.includes(id) && $levelGroups[id]) {
				// Skip level variants the popular list already offers as plain rows
				const usable = $levelGroups[id].filter((entry) => !popularPlainIds.has(entry.value));
				const target = pickDefaultLevel(usable);
				if (target) available.push({ id, label: variableLabel(id), target });
			} else if (isStandaloneVariable(id)) {
				available.push({ id, label: variableLabel(id), target: id });
			}
		}
		return available.sort((a, b) => a.label.localeCompare(b.label));
	});

	const isActive = (entry: { id: string; target: string }): boolean => {
		if (!isSingleVariableChart($activeChart)) return false;
		if (levelGroupVariables.includes(entry.id)) return $levelGroupSelected?.value === entry.id;
		return $variable === entry.id;
	};

	// Auto-expand once when the active variable moves into this section (e.g.
	// picked through search), without trapping the section open. The first run
	// is the mount itself, not a move: skip it so the persisted collapse
	// state survives reloads.
	let lastHostId: string | undefined;
	let mounted = false;
	$effect(() => {
		const hosts = levelHostId !== undefined && entries.some((entry) => entry.id === levelHostId);
		if (mounted && hosts && levelHostId !== lastHostId) open.set(true);
		mounted = true;
		lastHostId = hosts ? levelHostId : undefined;
	});

	// Surfaces the hidden active row on the collapsed header
	const anyActive = $derived(entries.some(isActive));

	// A popular row represents the active selection.
	const popularRowActive = (): boolean =>
		popularVariables.some((entry) => {
			if (entry.presetId && $activeChart.presetId === entry.presetId) return true;
			if (!isSingleVariableChart($activeChart)) return false;
			if (entry.levelGroup) return $levelGroupSelected?.value === entry.id;
			// Preset-backed rows also stand in for their plain variable
			return $variable === entry.id;
		});

	// Collapse on model change when the (possibly re-matched) selection landed
	// on a popular row; the check re-runs once the fallback variable settles.
	let lastDomain: string | undefined;
	let pendingDomainCollapse = false;
	$effect(() => {
		const covered = popularRowActive();
		if ($domain !== lastDomain) {
			const isFirstRun = lastDomain === undefined;
			lastDomain = $domain;
			if (isFirstRun) return;
			if (covered) {
				open.set(false);
			} else {
				pendingDomainCollapse = true;
			}
		} else if (pendingDomainCollapse) {
			pendingDomainCollapse = false;
			if (covered) open.set(false);
		}
	});
</script>

{#snippet variableRows()}
	{#each entries as entry (entry.id)}
		{@const active = isActive(entry)}
		<button
			class="hover:bg-primary/10 flex h-7 w-full cursor-pointer items-center justify-between px-3 text-sm {active
				? 'bg-primary/10 font-medium'
				: ''}"
			onclick={() => {
				if (!active) setPlainVariable(entry.target);
			}}
		>
			<div class="truncate text-left">{entry.label}</div>
			<CheckIcon class="size-4 shrink-0 {active ? '' : 'text-transparent'}" />
		</button>
		{#if levelHostId === entry.id}
			<div transition:slide={{ duration: 200 }}>
				<LevelSelect nested />
			</div>
		{/if}
	{/each}
{/snippet}

{#if entries.length}
	{#if hasPopular}
		<button
			class="hover:bg-primary/10 text-muted-foreground flex h-7.5 w-full cursor-pointer items-center gap-1.5 px-2 text-xs font-semibold tracking-wide uppercase"
			onclick={() => open.set(!$open)}
		>
			<ChevronRightIcon class="size-3.5 duration-200 {$open ? 'rotate-90' : ''}" />
			More variables
			{#if !$open && anyActive}
				<CheckIcon class="ml-auto size-3.5 shrink-0" />
			{/if}
			<span class="{!$open && anyActive ? '' : 'ml-auto'} pr-1 font-normal opacity-60">
				{entries.length}
			</span>
		</button>
		{#if $open}
			<div class="pb-1" transition:slide={{ duration: 200 }}>
				{@render variableRows()}
			</div>
		{/if}
	{:else}
		<div class="py-1">
			{@render variableRows()}
		</div>
	{/if}
{/if}
