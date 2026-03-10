<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import LayersIcon from '@lucide/svelte/icons/layers';
	import { VARIABLE_PREFIX } from '@openmeteo/mapbox-layer';
	import { toast } from 'svelte-sonner';

	import { activeChartSources } from '$lib/stores/chart';
	import { loading } from '$lib/stores/preferences';
	import { metaJson } from '$lib/stores/time';

	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';

	import { type ChartPreset, type ChartSource, chartPresets } from '$lib/chart-presets';
	import { destroySingleSource, restoreSingleSource } from '$lib/layers';
	import { applyChartSources, destroyMultiSource } from '$lib/multi-source-manager';
	import { clearChartSourcesFromUrl, setChartSourcesInUrl } from '$lib/url';

	let open = $state(false);

	/**
	 * Given meta-data variables, find the best match for a requested variable.
	 * Returns the exact variable if present, otherwise tries a prefix match,
	 * otherwise returns undefined.
	 */
	function resolveVariable(variable: string, available: string[]): string | undefined {
		if (available.includes(variable)) return variable;
		const prefix = variable.match(VARIABLE_PREFIX)?.groups?.prefix;
		if (prefix) {
			return available.find((v) => v.startsWith(prefix));
		}
		return undefined;
	}

	/** Resolve all sources of a preset against the current domain variables. */
	function resolvedSources(preset: ChartPreset, available: string[]): ChartSource[] | undefined {
		const resolved: ChartSource[] = [];
		for (const src of preset.sources) {
			const matched = resolveVariable(src.variable, available);
			if (!matched) return undefined;
			resolved.push(matched === src.variable ? src : { ...src, variable: matched });
		}
		return resolved;
	}

	// Group presets by their group label, with availability info
	const groups = $derived.by(() => {
		const available = $metaJson?.variables;
		const result: Record<
			string,
			Array<{ preset: ChartPreset; sources: ChartSource[] | undefined }>
		> = {};
		for (const preset of chartPresets) {
			const g = preset.group ?? 'Other';
			if (!result[g]) result[g] = [];
			result[g].push({
				preset,
				sources: available ? resolvedSources(preset, available) : preset.sources
			});
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

	function selectPreset(preset: ChartPreset, resolved: ChartSource[] | undefined) {
		if (!resolved) return;
		if (activePresetId === preset.id) {
			// Deselect — go back to single-source mode
			$activeChartSources = undefined;
			clearChartSourcesFromUrl();
			restoreSingleSource();
			toast('Switched back to single variable mode');
		} else {
			$activeChartSources = resolved;
			$loading = true;
			setChartSourcesInUrl(resolved);
			destroySingleSource();
			applyChartSources(resolved);
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

	// ── Custom sources ──────────────────────────────────────────────────

	let customSources = $state<ChartSource[]>([]);
	let showCustomEditor = $state(false);

	const availableVariables = $derived($metaJson?.variables ?? []);
	const isCustomActive = $derived(!!$activeChartSources && !activePresetId);

	// Auto-show and populate when popover opens with custom (non-preset) sources
	$effect(() => {
		if (open && isCustomActive && $activeChartSources) {
			customSources = $activeChartSources.map((s) => ({ ...s }));
			showCustomEditor = true;
		}
	});

	// Reset editor state when popover closes
	$effect(() => {
		if (!open) {
			showCustomEditor = false;
			customSources = [];
		}
	});

	function openCustomEditor() {
		if (isCustomActive && $activeChartSources) {
			customSources = $activeChartSources.map((s) => ({ ...s }));
		} else if (customSources.length === 0) {
			const vars = availableVariables;
			if (vars.length > 0) {
				customSources = [{ variable: vars[0], raster: true }];
			}
		}
		showCustomEditor = true;
	}

	function addCustomSource() {
		const vars = availableVariables;
		if (vars.length === 0) return;
		const used = new Set(customSources.map((s) => s.variable));
		const next = vars.find((va) => !used.has(va)) ?? vars[0];
		customSources = [...customSources, { variable: next, raster: true }];
	}

	function removeCustomSource(index: number) {
		customSources = customSources.filter((_, i) => i !== index);
	}

	function updateCustomSource(index: number, patch: Partial<ChartSource>) {
		customSources = customSources.map((s, i) => (i === index ? { ...s, ...patch } : s));
	}

	function applyCustomSources() {
		if (customSources.length === 0) return;
		const sources = customSources.map((s) => ({ ...s }));
		$activeChartSources = sources;
		$loading = true;
		setChartSourcesInUrl(sources);
		destroySingleSource();
		applyChartSources(sources);
		toast('Custom chart applied');
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
					: ''} hover:bg-glass/95! border-none h-auto min-h-7.25 cursor-pointer justify-between rounded p-1.5! gap-1.5"
				role="combobox"
				aria-expanded={open}
			>
				<LayersIcon class="size-4 shrink-0 opacity-70" />
				<div class="truncate max-w-60">
					<div class="truncate text-left">{activeLabel ?? 'Chart presets'}</div>
					{#if $activeChartSources}
						<div
							class="truncate text-left text-[10px] leading-tight text-muted-foreground font-normal"
						>
							{$activeChartSources
								.map((s) => {
									const parts: string[] = [];
									if (s.raster) parts.push('fill');
									if (s.contours) parts.push('contours');
									if (s.arrows) parts.push('arrows');
									const name = s.variable
										.replace(/_/g, ' ')
										.replace(/\b\w/g, (c) => c.toUpperCase());
									return name + ' (' + parts.join('+') + ')';
								})
								.join(' · ')}
						</div>
					{/if}
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
					{#each Object.entries(groups) as [groupLabel, entries] (groupLabel)}
						<Command.Group heading={groupLabel}>
							{#each entries as { preset, sources } (preset.id)}
								<Command.Item
									value={preset.id}
									disabled={!sources}
									class="hover:bg-primary/25! cursor-pointer {activePresetId === preset.id
										? 'bg-primary/10!'
										: ''} {!sources ? 'opacity-40 cursor-not-allowed!' : ''}"
									onSelect={() => selectPreset(preset, sources)}
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
			<!-- Custom sources editor -->
			<div class="mt-1 bg-glass/85 backdrop-blur-sm rounded p-2">
				{#if showCustomEditor || isCustomActive}
					<div class="text-xs font-medium mb-1.5">Custom Sources</div>
					{#each customSources as source, i}
						<div class="flex items-center gap-1 mb-1.5">
							<select
								class="flex-1 text-xs bg-background/60 border border-muted-foreground/20 rounded px-1 h-6 min-w-0"
								value={source.variable}
								onchange={(e) => updateCustomSource(i, { variable: e.currentTarget.value })}
							>
								{#each availableVariables as va}
									<option value={va}>{va}</option>
								{/each}
							</select>
							<label
								class="text-[10px] flex items-center gap-0.5 cursor-pointer"
								title="Raster fill"
							>
								<input
									type="checkbox"
									checked={!!source.raster}
									onchange={() => updateCustomSource(i, { raster: !source.raster })}
									class="size-3"
								/>
								R
							</label>
							<label class="text-[10px] flex items-center gap-0.5 cursor-pointer" title="Contours">
								<input
									type="checkbox"
									checked={!!source.contours}
									onchange={() => updateCustomSource(i, { contours: !source.contours })}
									class="size-3"
								/>
								C
							</label>
							<label class="text-[10px] flex items-center gap-0.5 cursor-pointer" title="Arrows">
								<input
									type="checkbox"
									checked={!!source.arrows}
									onchange={() => updateCustomSource(i, { arrows: !source.arrows })}
									class="size-3"
								/>
								A
							</label>
							<button
								type="button"
								class="text-xs text-muted-foreground hover:text-foreground cursor-pointer px-0.5"
								onclick={() => removeCustomSource(i)}
								title="Remove source">✕</button
							>
						</div>
					{/each}
					<div class="flex gap-1.5 mt-1">
						<button
							type="button"
							class="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
							onclick={addCustomSource}
						>
							+ Add source
						</button>
						{#if customSources.length > 0}
							<button
								type="button"
								class="ml-auto text-xs bg-primary/20 hover:bg-primary/30 rounded px-2 py-0.5 cursor-pointer"
								onclick={applyCustomSources}
							>
								Apply
							</button>
						{/if}
					</div>
				{:else}
					<button
						type="button"
						class="w-full text-xs text-muted-foreground hover:text-foreground cursor-pointer py-0.5"
						onclick={openCustomEditor}
					>
						+ Custom sources
					</button>
				{/if}
			</div>
		</Popover.Content>
	</Popover.Root>
</div>
