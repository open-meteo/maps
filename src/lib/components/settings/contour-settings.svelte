<script lang="ts">
	import { mode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';

	import { activeChartSources } from '$lib/stores/chart';
	import { customContourStyles } from '$lib/stores/chart-styles';
	import { variable } from '$lib/stores/variables';
	import { defaultVectorOptions, vectorOptions } from '$lib/stores/vector';

	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import {
		type ContourLevel,
		defaultContourStyle,
		parseRgbaOpacity,
		setRgbaOpacity
	} from '$lib/chart-styles';
	import { changeOMfileURL } from '$lib/layers';
	import { applyChartSources } from '$lib/multi-source-manager';
	import { updateUrl } from '$lib/url';

	let contours = $derived($vectorOptions.contours);
	let breakpoints = $derived($vectorOptions.breakpoints);
	const isDark = $derived(mode.current === 'dark');

	const style = $derived($customContourStyles[$variable] ?? defaultContourStyle);

	const handleContourIntervalChange = () => {
		updateUrl(
			'contour_interval',
			String($vectorOptions.contourInterval),
			String(defaultVectorOptions.contourInterval)
		);
		if (contours) {
			changeOMfileURL();
		}
	};

	function updateLevel(levelIndex: number, patch: Partial<ContourLevel>) {
		customContourStyles.update((styles) => {
			const current = structuredClone(styles[$variable] ?? defaultContourStyle);
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
	<h2 class="text-lg font-bold">Contour settings</h2>
	<div class="mt-3 flex gap-3">
		<Switch
			id="contouring"
			class="cursor-pointer"
			bind:checked={$vectorOptions.contours}
			onCheckedChange={() => {
				updateUrl('contours', String(contours));

				changeOMfileURL();
				toast.info('Contours turned ' + (contours ? 'on' : 'off'));
			}}
		/>
		<Label class="cursor-pointer" for="contouring">Contouring {contours ? 'on' : 'off'}</Label>
	</div>
	<div class="mt-3 flex gap-3">
		<Switch
			id="breakpoints"
			class="cursor-pointer"
			bind:checked={$vectorOptions.breakpoints}
			onCheckedChange={() => {
				updateUrl(
					'interval_on_breakpoints',
					String(breakpoints),
					String(defaultVectorOptions.breakpoints)
				);

				if (contours) {
					changeOMfileURL();
					toast.info('Contour interval on colorscale turned ' + (breakpoints ? 'on' : 'off'));
				}
			}}
		/>
		<Label class="cursor-pointer" for="contouring"
			>Interval on breakpoints {breakpoints ? 'on' : 'off'}</Label
		>
	</div>
	<div class="mt-3 flex gap-3 duration-300 {breakpoints ? 'opacity-50' : ''}">
		<input
			disabled={breakpoints}
			id="interval_slider"
			class="w-25 delay-75 duration-200"
			type="range"
			min="0"
			max="50"
			bind:value={$vectorOptions.contourInterval}
			onchange={handleContourIntervalChange}
		/>
		<Label for="interval">Contouring interval:</Label>
		<Input
			id="interval"
			class="w-20 bg-background/60"
			step="0.5"
			bind:value={$vectorOptions.contourInterval}
			onchange={handleContourIntervalChange}
		/>
	</div>
	{#if contours}
		<details class="mt-3" open>
			<summary class="text-sm font-medium cursor-pointer select-none">Contour style levels</summary>
			<div class="mt-2 flex flex-col gap-2">
				{#each style.levels as level, li}
					{@const color = isDark ? level.darkColor : level.lightColor}
					<div
						class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-muted-foreground/20 p-2"
					>
						<svg width="24" height="14" class="shrink-0">
							<line x1="1" y1="7" x2="23" y2="7" stroke={color} stroke-width={level.width} />
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
