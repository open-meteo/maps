<script lang="ts">
	import { slide } from 'svelte/transition';

	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { persisted } from 'svelte-persisted-store';

	import {
		activeChart,
		applyPreset,
		isSingleVariableChart,
		setPlainVariable,
		setSources
	} from '$lib/stores/chart';
	import { epsMeta } from '$lib/stores/eps';
	import { metaJson } from '$lib/stores/time';
	import { levelGroupSelected, variable } from '$lib/stores/variables';

	import { sourcesEqual } from '$lib/chart-encoding';
	import { getChartPreset, popularVariables } from '$lib/chart-presets';

	import LevelSelect from './level-select.svelte';
	import { levelGroups, resolvePopularTarget, variableLabel } from './selection-utils';

	import type { ChartSource } from '$lib/chart-types';

	interface Props {
		/** Popular entry id whose row hosts the nested level selector. */
		levelHostId?: string;
	}

	let { levelHostId = undefined }: Props = $props();

	// Defaults to open on first visit; the collapsed state persists once toggled.
	const open = persisted('popular-variables-open', true);

	interface PopularEntry {
		id: string;
		label: string;
		target: string;
		levelGroup: boolean;
		presetId?: string;
		/** Apply these exact sources instead (dynamic EPS charts). */
		sources?: ChartSource[];
	}

	/** The one variable the EPS sibling domains provide. */
	const EPS_VARIABLE = 'precipitation_probability';

	// Popular entries the current domain actually serves; level groups resolve
	// to their preferred level variant on click, preset-backed rows apply
	// their chart preset instead of a plain variable.
	const entries = $derived.by(() => {
		if (!$metaJson) return [];
		const available: PopularEntry[] = [];
		for (const entry of popularVariables) {
			const resolved = resolvePopularTarget(entry, $metaJson.variables, $levelGroups);
			if (!resolved) continue;
			available.push({
				id: entry.id,
				label:
					entry.label ??
					(resolved.presetId
						? (getChartPreset(resolved.presetId)?.label ?? entry.id)
						: variableLabel(entry.id)),
				target: resolved.variable ?? '',
				levelGroup: !!entry.levelGroup,
				presetId: resolved.presetId
			});
		}
		// The active domain's EPS sibling contributes its ensemble variable
		// (the combined precip + probability chart lives in the chart list)
		if ($epsMeta?.variables.includes(EPS_VARIABLE)) {
			available.push({
				id: `eps_${EPS_VARIABLE}`,
				label: 'Precip Probability (EPS)',
				target: EPS_VARIABLE,
				levelGroup: false,
				sources: [{ variable: EPS_VARIABLE, raster: true, domain: $epsMeta.domain }]
			});
		}
		return available;
	});

	// A level-group row stays active on any of its levels, so the nested level
	// selector remains in place when another pressure/height level is picked.
	const isActive = (entry: PopularEntry): boolean => {
		if (entry.sources) return sourcesEqual($activeChart.sources, entry.sources);
		if (entry.presetId) return $activeChart.presetId === entry.presetId;
		if (!isSingleVariableChart($activeChart)) return false;
		if (entry.levelGroup) return $levelGroupSelected?.value === entry.id;
		return $variable === entry.id;
	};

	// Surfaces the hidden active row on the collapsed header
	const anyActive = $derived(entries.some(isActive));

	const select = (entry: PopularEntry): void => {
		if (entry.sources) {
			setSources(entry.sources);
		} else if (entry.presetId) {
			applyPreset(entry.presetId);
		} else {
			setPlainVariable(entry.target);
		}
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
</script>

{#if entries.length}
	<button
		class="hover:bg-primary/10 text-muted-foreground flex h-7.5 w-full cursor-pointer items-center gap-1.5 px-2 text-xs font-semibold tracking-wide uppercase"
		onclick={() => open.set(!$open)}
	>
		<ChevronRightIcon class="size-3.5 duration-200 {$open ? 'rotate-90' : ''}" />
		Popular variables
		{#if !$open && anyActive}
			<CheckIcon class="mr-1 ml-auto size-3.5 shrink-0" />
		{/if}
	</button>
	{#if $open}
		<div class="pb-1" transition:slide={{ duration: 200 }}>
			{#each entries as entry (entry.id)}
				{@const active = isActive(entry)}
				<button
					class="hover:bg-primary/10 flex h-7.5 w-full cursor-pointer items-center justify-between px-3 text-sm {active
						? 'bg-primary/10 font-medium'
						: ''}"
					onclick={() => {
						if (!active) select(entry);
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
		</div>
	{/if}
{/if}
