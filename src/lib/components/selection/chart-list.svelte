<script lang="ts">
	import { slide } from 'svelte/transition';

	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import XIcon from '@lucide/svelte/icons/x';
	import { persisted } from 'svelte-persisted-store';

	import {
		activeChart,
		applySavedChart,
		deleteSavedChart,
		savedCharts,
		setSources
	} from '$lib/stores/chart';
	import { epsMeta } from '$lib/stores/eps';
	import { metaJson } from '$lib/stores/time';

	import { sourcesEqual } from '$lib/chart-encoding';
	import { chartPresets } from '$lib/chart-presets';

	import type { ChartPreset } from '$lib/chart-types';

	// Which chart groups are expanded, persisted across sessions
	const openGroups = persisted<Record<string, boolean>>('chart-groups-open', {});

	interface GroupedPreset {
		preset: ChartPreset;
		/** The domain serves every variable of the preset. */
		available: boolean;
	}

	const presetGroups = $derived.by(() => {
		const groups: { name: string; presets: GroupedPreset[] }[] = [];
		if (!$metaJson) return groups;
		for (const preset of chartPresets) {
			const available = preset.sources.every((source) =>
				$metaJson.variables.includes(source.variable)
			);
			const name = preset.group ?? 'Other';
			const group = groups.find((g) => g.name === name);
			if (group) {
				group.presets.push({ preset, available });
			} else {
				groups.push({ name, presets: [{ preset, available }] });
			}
		}
		// Dynamic EPS chart: the sibling domain depends on the active domain,
		// so this cannot be a static preset entry.
		if (
			$epsMeta?.variables.includes('precipitation_probability') &&
			$metaJson.variables.includes('precipitation')
		) {
			const epsChart: ChartPreset = {
				id: 'eps_precip_probability',
				label: 'Precipitation + Probability (EPS)',
				description: 'Ensemble probability contours over precipitation',
				group: 'Precipitation',
				sources: [
					{ variable: 'precipitation', raster: true },
					{
						variable: 'precipitation_probability',
						contours: true,
						contourInterval: 20,
						domain: $epsMeta.domain
					}
				]
			};
			const group = groups.find((g) => g.name === epsChart.group);
			const entry = { preset: epsChart, available: true };
			if (group) group.presets.push(entry);
			else groups.push({ name: epsChart.group ?? 'Other', presets: [entry] });
		}
		// Unavailable presets sink to the bottom of their group
		for (const group of groups) {
			group.presets.sort((a, b) => Number(b.available) - Number(a.available));
		}
		return groups;
	});

	const toggleGroup = (name: string, defaultOpen = false) => {
		// The default matters: groups rendered open-by-default ("My charts")
		// would otherwise need two clicks for the first collapse
		openGroups.update((state) => ({ ...state, [name]: !(state[name] ?? defaultOpen) }));
	};
</script>

<div class="flex flex-col py-1">
	<div
		class="text-muted-foreground flex h-7.5 items-center px-3 text-xs font-semibold tracking-wide uppercase"
	>
		Combined charts
	</div>
	{#each presetGroups as group (group.name)}
		{@const availableInGroup = group.presets.some((entry) => entry.available)}
		{@const groupOpen = availableInGroup && ($openGroups[group.name] ?? false)}
		{@const availableCount = group.presets.filter((entry) => entry.available).length}
		<button
			class="text-foreground/85 flex h-7.5 w-full items-center gap-1.5 px-2 text-[13px] font-medium {availableInGroup
				? 'hover:bg-primary/10 cursor-pointer'
				: 'cursor-not-allowed opacity-40'}"
			disabled={!availableInGroup}
			title={availableInGroup ? undefined : 'No charts available in this domain'}
			onclick={() => toggleGroup(group.name)}
		>
			<ChevronRightIcon class="size-3.5 duration-200 {groupOpen ? 'rotate-90' : ''}" />
			{group.name}
			<span class="ml-auto pr-1 font-normal opacity-60">
				{availableCount === group.presets.length
					? group.presets.length
					: `${availableCount}/${group.presets.length}`}
			</span>
		</button>
		{#if groupOpen}
			<div class="pb-1" transition:slide={{ duration: 200 }}>
				{#each group.presets as { preset, available } (preset.id)}
					{@const active =
						$activeChart.presetId === preset.id ||
						sourcesEqual($activeChart.sources, preset.sources)}
					<button
						class="flex w-full items-center justify-between gap-1.5 py-1 pr-3 pl-5 {available
							? 'hover:bg-primary/10 cursor-pointer'
							: 'cursor-not-allowed opacity-40'} {active ? 'bg-primary/10' : ''}"
						title={available ? preset.label : 'Not available in this domain'}
						disabled={!available}
						onclick={() => setSources(preset.sources)}
					>
						<div class="min-w-0 text-left">
							<div class="truncate text-sm leading-4.5">{preset.label}</div>
							{#if preset.description}
								<div class="text-muted-foreground truncate text-[11px] leading-3.5">
									{preset.description}
								</div>
							{/if}
						</div>
						<CheckIcon class="size-4 shrink-0 {active ? '' : 'text-transparent'}" />
					</button>
				{/each}
			</div>
		{/if}
	{/each}

	{#if $savedCharts.charts.length}
		<button
			class="hover:bg-primary/10 text-foreground/85 flex h-7.5 w-full cursor-pointer items-center gap-1.5 px-2 text-[13px] font-medium"
			onclick={() => toggleGroup('My charts', true)}
		>
			<ChevronRightIcon
				class="size-3.5 duration-200 {($openGroups['My charts'] ?? true) ? 'rotate-90' : ''}"
			/>
			My charts
			<span class="ml-auto pr-1 font-normal opacity-60">{$savedCharts.charts.length}</span>
		</button>
		{#if $openGroups['My charts'] ?? true}
			<div class="pb-1" transition:slide={{ duration: 200 }}>
				{#each $savedCharts.charts as chart (chart.id)}
					{@const active = sourcesEqual($activeChart.sources, chart.sources)}
					<div
						class="hover:bg-primary/10 group flex w-full items-center justify-between gap-1.5 py-1 pr-3 pl-5 {active
							? 'bg-primary/10'
							: ''}"
					>
						<button
							class="min-w-0 flex-1 cursor-pointer text-left"
							title={chart.name}
							onclick={() => applySavedChart(chart.id)}
						>
							<div class="truncate text-sm leading-4.5">{chart.name}</div>
							<div class="text-muted-foreground truncate text-[11px] leading-3.5">
								{chart.sources.map((source) => source.variable).join(' + ')}
							</div>
						</button>
						{#if active}
							<CheckIcon class="size-4 shrink-0" />
						{:else}
							<button
								class="cursor-pointer opacity-0 duration-150 group-hover:opacity-60 hover:opacity-100!"
								aria-label="Delete saved chart"
								onclick={() => deleteSavedChart(chart.id)}
							>
								<XIcon class="size-3.5" />
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
