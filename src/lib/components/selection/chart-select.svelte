<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import LayersIcon from '@lucide/svelte/icons/layers';
	import { toast } from 'svelte-sonner';

	import { activeChartSources } from '$lib/stores/chart';
	import { loading } from '$lib/stores/preferences';

	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';

	import { type ChartPreset, chartPresets } from '$lib/chart-presets';
	import { destroySingleSource, restoreSingleSource } from '$lib/layers';
	import { applyChartSources, destroyMultiSource } from '$lib/multi-source-manager';
	import { clearChartSourcesFromUrl, setChartSourcesInUrl } from '$lib/url';

	let open = $state(false);

	// Group presets by their group label
	const groups = $derived.by(() => {
		const result: Record<string, ChartPreset[]> = {};
		for (const preset of chartPresets) {
			const g = preset.group ?? 'Other';
			if (!result[g]) result[g] = [];
			result[g].push(preset);
		}
		return result;
	});

	// Match current sources to a preset (by comparing variable lists)
	const activePresetId = $derived.by(() => {
		const sources = $activeChartSources;
		if (!sources) return undefined;
		for (const preset of chartPresets) {
			if (preset.sources.length !== sources.length) continue;
			const match = preset.sources.every((ps, i) => ps.variable === sources[i].variable);
			if (match) return preset.id;
		}
		return undefined;
	});

	// Label for the button
	const activeLabel = $derived.by(() => {
		if (!activePresetId) return $activeChartSources ? 'Custom chart' : undefined;
		return chartPresets.find((p) => p.id === activePresetId)?.label;
	});

	function selectPreset(preset: ChartPreset) {
		if (activePresetId === preset.id) {
			// Deselect — go back to single-source mode
			$activeChartSources = undefined;
			clearChartSourcesFromUrl();
			restoreSingleSource();
			toast('Switched back to single variable mode');
		} else {
			$activeChartSources = preset.sources;
			$loading = true;
			setChartSourcesInUrl(preset.sources);
			destroySingleSource();
			applyChartSources(preset.sources);
			toast('Chart: ' + preset.label);
		}
		open = false;
	}

	function clearPreset() {
		$activeChartSources = undefined;
		clearChartSourcesFromUrl();
		destroyMultiSource();
		restoreSingleSource();
		toast('Switched back to single variable mode');
		open = false;
	}
</script>

<div class="absolute top-2.5 left-1/2 z-70 -translate-x-1/2">
	<Popover.Root bind:open>
		<Popover.Trigger>
			<Button
				variant="outline"
				class="bg-glass/75 dark:bg-glass/75 backdrop-blur-sm shadow-md {open
					? 'bg-glass/95!'
					: ''} hover:bg-glass/95! border-none h-7.25 cursor-pointer justify-between rounded p-1.5! gap-1.5"
				role="combobox"
				aria-expanded={open}
			>
				<LayersIcon class="size-4 shrink-0 opacity-70" />
				<div class="truncate max-w-50">
					{activeLabel ?? 'Chart presets'}
				</div>
				<ChevronsUpDownIcon class="size-4 shrink-0 opacity-50" />
			</Button>
		</Popover.Trigger>
		<Popover.Content class="bg-transparent! z-80 w-75 rounded border-none! p-0">
			<Popover.Close
				class="absolute right-0.5 top-0.5 flex h-5 w-5 cursor-pointer items-center justify-center"
			>
				<button aria-label="Close popover">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="cursor-pointer"
					>
						<line x1="18" y1="6" x2="6" y2="18"></line>
						<line x1="6" y1="6" x2="18" y2="18"></line>
					</svg>
				</button>
			</Popover.Close>
			<Command.Root class="bg-glass/85! backdrop-blur-sm rounded">
				<Command.Input class="border-none ring-0" placeholder="Search charts..." />
				<Command.List>
					<Command.Empty>No charts found.</Command.Empty>
					{#if $activeChartSources}
						<Command.Item
							value="__clear__"
							class="hover:bg-primary/25! cursor-pointer text-muted-foreground italic"
							onSelect={clearPreset}
						>
							Clear preset (single variable)
						</Command.Item>
						<Command.Separator />
					{/if}
					{#each Object.entries(groups) as [groupLabel, presets] (groupLabel)}
						<Command.Group heading={groupLabel}>
							{#each presets as preset (preset.id)}
								<Command.Item
									value={preset.id}
									class="hover:bg-primary/25! cursor-pointer {activePresetId === preset.id
										? 'bg-primary/10!'
										: ''}"
									onSelect={() => selectPreset(preset)}
									aria-selected={activePresetId === preset.id}
								>
									<div class="flex w-full items-center justify-between gap-2">
										<div class="flex flex-col">
											<span>{preset.label}</span>
											<span class="text-muted-foreground text-xs">
												{preset.sources.length} source{preset.sources.length > 1 ? 's' : ''}
												&mdash;
												{preset.sources
													.map(
														(s) =>
															[s.raster ? 'raster' : '', s.contours ? 'contours' : '']
																.filter(Boolean)
																.join('+') || 'vector'
													)
													.join(', ')}
											</span>
										</div>
										<CheckIcon
											class="size-4 shrink-0 {activePresetId !== preset.id
												? 'text-transparent'
												: ''}"
										/>
									</div>
								</Command.Item>
							{/each}
						</Command.Group>
					{/each}
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>
</div>
