<script lang="ts">
	import { mode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';

	import { activeChartSources } from '$lib/stores/chart';
	import { customArrowStyles } from '$lib/stores/chart-styles';
	import { variable } from '$lib/stores/variables';
	import { vectorOptions } from '$lib/stores/vector';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import {
		type ArrowLevel,
		defaultArrowStyle,
		parseRgbaOpacity,
		setRgbaOpacity
	} from '$lib/chart-styles';
	import { changeOMfileURL } from '$lib/layers';
	import { applyChartSources } from '$lib/multi-source-manager';
	import { updateUrl } from '$lib/url';

	let arrows = $derived($vectorOptions.arrows);
	const isDark = $derived(mode.current === 'dark');

	const style = $derived($customArrowStyles[$variable] ?? defaultArrowStyle);

	function updateLevel(levelIndex: number, patch: Partial<ArrowLevel>) {
		customArrowStyles.update((styles) => {
			const current = structuredClone(styles[$variable] ?? defaultArrowStyle);
			current.levels[levelIndex] = { ...current.levels[levelIndex], ...patch };
			return { ...styles, [$variable]: current };
		});
	}

	function applyStyles() {
		const sources = $activeChartSources;
		if (sources) {
			applyChartSources(sources);
		} else {
			changeOMfileURL();
		}
	}
</script>

<div>
	<h2 class="text-lg font-bold">Arrows settings</h2>
	<div class="mt-3 flex gap-3">
		<Switch
			id="arrows"
			class="cursor-pointer"
			bind:checked={$vectorOptions.arrows}
			onCheckedChange={() => {
				updateUrl('arrows', String(arrows));
				changeOMfileURL();
				toast.info('Arrows turned ' + (arrows ? 'on' : 'off'));
			}}
		/>
		<Label class="cursor-pointer" for="arrows">Arrows {arrows ? 'on' : 'off'}</Label>
	</div>
	{#if arrows}
		<details class="mt-3" open>
			<summary class="text-sm font-medium cursor-pointer select-none">Arrow style levels</summary>
			<div class="mt-2 flex flex-col gap-2">
				{#each style.levels as level, li}
					{@const color = isDark ? level.darkColor : level.lightColor}
					<div
						class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-muted-foreground/20 p-2"
					>
						<svg width="24" height="14" class="shrink-0">
							<line x1="1" y1="7" x2="18" y2="7" stroke={color} stroke-width={level.width} />
							<polyline
								points="14,3 18,7 14,11"
								fill="none"
								stroke={color}
								stroke-width={Math.min(level.width, 2)}
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						<span class="text-xs w-8 shrink-0">{level.label}</span>
						<div class="flex flex-1 items-center gap-1 min-w-32">
							<span class="text-[10px] text-muted-foreground">W</span>
							<input
								type="range"
								min="0.5"
								max="5"
								step="0.1"
								value={level.width}
								oninput={(e) => updateLevel(li, { width: parseFloat(e.currentTarget.value) })}
								onchange={applyStyles}
								class="flex-1 h-2"
							/>
							<span class="text-[10px] w-5">{level.width.toFixed(1)}</span>
						</div>
						<div class="flex flex-1 items-center gap-1 min-w-32">
							<span class="text-[10px] text-muted-foreground">A</span>
							<input
								type="range"
								min="0"
								max="1"
								step="0.05"
								value={parseRgbaOpacity(color)}
								oninput={(e) => {
									const a = parseFloat(e.currentTarget.value);
									updateLevel(li, {
										lightColor: setRgbaOpacity(level.lightColor, a),
										darkColor: setRgbaOpacity(level.darkColor, a)
									});
								}}
								onchange={applyStyles}
								class="flex-1 h-2"
							/>
							<span class="text-[10px] w-6">{parseRgbaOpacity(color).toFixed(2)}</span>
						</div>
					</div>
				{/each}
			</div>
		</details>
	{/if}
</div>
