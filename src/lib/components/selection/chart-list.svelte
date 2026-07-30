<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import XIcon from '@lucide/svelte/icons/x';
	import { persisted } from 'svelte-persisted-store';

	import {
		activeChart,
		applyPreset,
		applySavedChart,
		deleteSavedChart,
		savedCharts
	} from '$lib/stores/chart';
	import { metaJson } from '$lib/stores/time';

	import * as Collapsible from '$lib/components/ui/collapsible';

	import { chartPresets } from '$lib/chart-presets';

	// Which chart groups are expanded, persisted across sessions
	const openGroups = persisted<Record<string, boolean>>('chart-groups-open', {});

	const presetGroups = $derived.by(() => {
		const groups: { name: string; presets: typeof chartPresets }[] = [];
		if (!$metaJson) return groups;
		for (const preset of chartPresets) {
			// A preset is offered when the domain serves all its variables
			if (!preset.sources.every((source) => $metaJson.variables.includes(source.variable))) {
				continue;
			}
			const name = preset.group ?? 'Other';
			const group = groups.find((g) => g.name === name);
			if (group) {
				group.presets.push(preset);
			} else {
				groups.push({ name, presets: [preset] });
			}
		}
		return groups;
	});

	const toggleGroup = (name: string) => {
		openGroups.update((state) => ({ ...state, [name]: !state[name] }));
	};
</script>

<div class="flex flex-col py-1">
	{#each presetGroups as group (group.name)}
		<Collapsible.Root
			open={$openGroups[group.name] ?? false}
			onOpenChange={() => toggleGroup(group.name)}
		>
			<Collapsible.Trigger
				class="hover:bg-primary/10 text-muted-foreground flex h-7.5 w-full cursor-pointer items-center gap-1.5 px-2 text-xs font-semibold tracking-wide uppercase"
			>
				<ChevronRightIcon
					class="size-3.5 duration-200 {($openGroups[group.name] ?? false) ? 'rotate-90' : ''}"
				/>
				{group.name}
				<span class="ml-auto pr-1 font-normal opacity-60">{group.presets.length}</span>
			</Collapsible.Trigger>
			<Collapsible.Content class="pb-1">
				{#each group.presets as preset (preset.id)}
					{@const active = $activeChart.presetId === preset.id}
					<button
						class="hover:bg-primary/10 flex w-full cursor-pointer items-center justify-between gap-1.5 px-3 py-1 {active
							? 'bg-primary/10'
							: ''}"
						title={preset.label}
						onclick={() => applyPreset(preset.id)}
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
			</Collapsible.Content>
		</Collapsible.Root>
	{/each}

	{#if $savedCharts.charts.length}
		<Collapsible.Root
			open={$openGroups['My charts'] ?? true}
			onOpenChange={() => toggleGroup('My charts')}
		>
			<Collapsible.Trigger
				class="hover:bg-primary/10 text-muted-foreground flex h-7.5 w-full cursor-pointer items-center gap-1.5 px-2 text-xs font-semibold tracking-wide uppercase"
			>
				<ChevronRightIcon
					class="size-3.5 duration-200 {($openGroups['My charts'] ?? true) ? 'rotate-90' : ''}"
				/>
				My charts
				<span class="ml-auto pr-1 font-normal opacity-60">{$savedCharts.charts.length}</span>
			</Collapsible.Trigger>
			<Collapsible.Content class="pb-1">
				{#each $savedCharts.charts as chart (chart.id)}
					{@const active = $activeChart.name === chart.name}
					<div
						class="hover:bg-primary/10 group flex w-full items-center justify-between gap-1.5 px-3 py-1 {active
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
			</Collapsible.Content>
		</Collapsible.Root>
	{/if}
</div>
