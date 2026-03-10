<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';

	import { type RenderableColorScale, getColor, getColorScale } from '@openmeteo/mapbox-layer';
	import { mode } from 'mode-watcher';

	import { activeChartSources } from '$lib/stores/chart';
	import { customArrowStyles, customContourStyles } from '$lib/stores/chart-styles';
	import { customColorScales } from '$lib/stores/om-protocol-settings';
	import { opacity, preferences } from '$lib/stores/preferences';
	import {
		convertValue,
		getDisplayUnit,
		getUnitOptions,
		setUnitForCategory,
		unitPreferences
	} from '$lib/stores/units';
	import { variable } from '$lib/stores/variables';
	import { vectorOptions } from '$lib/stores/vector';

	import * as Select from '$lib/components/ui/select';

	import {
		type ArrowLevel,
		type ArrowStyle,
		type ContourLevel,
		type ContourStyle,
		defaultArrowStyle,
		defaultContourStyle,
		parseRgbaOpacity,
		setRgbaOpacity
	} from '$lib/chart-styles';
	import { getAlpha, hexToRgba, rgbaToHex } from '$lib/color';
	import { textWhite } from '$lib/helpers';
	import { changeOMfileURL } from '$lib/layers';
	import { applyChartSources } from '$lib/multi-source-manager';
	import { refreshPopup } from '$lib/popup';

	import ColorPicker from './color-picker.svelte';

	import type { ChartSource } from '$lib/chart-presets';

	interface Props {
		editable?: boolean;
		afterColorScaleChange: (variable: string, colorScale: RenderableColorScale) => void;
	}

	let { editable = true, afterColorScaleChange }: Props = $props();

	const isDark = $derived(mode.current === 'dark');
	const baseColorScale: RenderableColorScale = $derived(getColorScale($variable, isDark));
	// Use custom scale if available, otherwise use base
	const colorScale = $derived($customColorScales[$variable] ?? baseColorScale);

	let editingIndex: number | null = $state(null);
	/** Tracks which scale bar is being color-edited in multi-source mode (sourceIndex). */
	let editingSourceIndex: number | null = $state(null);

	// ── Multi-source derived state ──────────────────────────────────────
	const chartSources = $derived($activeChartSources);
	const isMultiSource = $derived(!!chartSources && chartSources.length > 0);

	/** Per-source color scale info for multi-source mode. */
	const multiSourceScales = $derived.by(() => {
		if (!chartSources) return [];
		return chartSources.map((src) => {
			const base = getColorScale(src.variable, isDark);
			const custom = $customColorScales[src.variable];
			return {
				source: src,
				colorScale: custom ?? base,
				variable: src.variable
			};
		});
	});

	const getLabeledColorsForLegend = (scale: RenderableColorScale) => {
		if (scale.type === 'rgba') {
			const steps = 25;
			const stepSize = (scale.max - scale.min) / steps;
			return Array.from({ length: steps + 1 }, (_, i) => {
				const value = Math.floor(scale.min + i * stepSize);
				return { value, color: getColor(scale, value), index: i };
			});
		}

		return scale.breakpoints.map((value, i) => ({
			value,
			color: getColor(scale, value),
			index: i
		}));
	};

	const formatValue = (value: number, digits: number): string => {
		const converted = convertValue(value, colorScale.unit, $unitPreferences);
		if (Math.abs(converted) >= 1) return converted.toFixed(0);
		if (Math.abs(converted) >= 0.1) return converted.toFixed(1);
		return converted.toFixed(digits);
	};

	const formatValueForScale = (
		value: number,
		digits: number,
		scale: RenderableColorScale
	): string => {
		const converted = convertValue(value, scale.unit, $unitPreferences);
		if (Math.abs(converted) >= 1) return converted.toFixed(0);
		if (Math.abs(converted) >= 0.1) return converted.toFixed(1);
		return converted.toFixed(digits);
	};

	const handleColorClick = (index: number, e: MouseEvent, sourceIndex?: number) => {
		if (!editable) return;
		e.stopPropagation();
		editingIndex = index;
		editingSourceIndex = sourceIndex ?? null;
	};

	const handleColorChange = (newHex: string, newAlpha: number) => {
		if (editingIndex === null) return;

		const targetVariable =
			editingSourceIndex !== null && chartSources
				? chartSources[editingSourceIndex].variable
				: $variable;
		const targetScale =
			editingSourceIndex !== null
				? (multiSourceScales[editingSourceIndex]?.colorScale ?? colorScale)
				: colorScale;

		const newScale = structuredClone(targetScale);
		const newColor = hexToRgba(newHex, newAlpha);

		if (newScale.colors) {
			newScale.colors[editingIndex] = newColor;
		}

		customColorScales.update((scales) => ({
			...scales,
			[targetVariable]: newScale
		}));
		afterColorScaleChange(targetVariable, newScale);
	};

	const closePicker = () => {
		editingIndex = null;
		editingSourceIndex = null;
	};

	/** Pretty-print a variable name for display. */
	const prettyVariable = (v: string): string =>
		v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

	/** Update a chart source property and re-apply. */
	function updateChartSource(index: number, patch: Partial<ChartSource>) {
		if (!chartSources) return;
		const updated = chartSources.map((s, i) => (i === index ? { ...s, ...patch } : s));
		$activeChartSources = updated;
		applyChartSources(updated);
	}

	// ── Contour/arrow style bars ────────────────────────────────────────

	let editingStyle: {
		type: 'contour' | 'arrow';
		variable: string;
		levelIndex: number;
	} | null = $state(null);

	function getContourStyle(v: string): ContourStyle {
		return $customContourStyles[v] ?? defaultContourStyle;
	}
	function getArrowStyle(v: string): ArrowStyle {
		return $customArrowStyles[v] ?? defaultArrowStyle;
	}

	function startStyleEdit(type: 'contour' | 'arrow', v: string, levelIndex: number) {
		editingStyle = { type, variable: v, levelIndex };
	}
	function closeStyleEdit() {
		editingStyle = null;
	}

	function updateContourLevel(v: string, levelIndex: number, patch: Partial<ContourLevel>) {
		customContourStyles.update((styles) => {
			const current = structuredClone(styles[v] ?? defaultContourStyle);
			current.levels[levelIndex] = { ...current.levels[levelIndex], ...patch };
			return { ...styles, [v]: current };
		});
	}

	function updateArrowLevel(v: string, levelIndex: number, patch: Partial<ArrowLevel>) {
		customArrowStyles.update((styles) => {
			const current = structuredClone(styles[v] ?? defaultArrowStyle);
			current.levels[levelIndex] = { ...current.levels[levelIndex], ...patch };
			return { ...styles, [v]: current };
		});
	}

	/** Re-apply chart sources to update map layers with new styles. */
	function applyStyleChanges() {
		const sources = $activeChartSources;
		if (sources) {
			applyChartSources(sources);
		} else {
			changeOMfileURL();
		}
	}

	const STYLE_BAR_WIDTH = 55;
	const STYLE_LEVEL_HEIGHT = 22;

	const digits = 2;
	const labeledColors = $derived(getLabeledColorsForLegend(colorScale));
	const displayUnit = $derived(getDisplayUnit(colorScale.unit, $unitPreferences));
	const unitOptions = $derived(getUnitOptions(colorScale.unit));
	const valueLength = $derived(String(Math.round(labeledColors.at(-1)?.value ?? 1)).length);
	const labelWidth = $derived(17 + Math.max(valueLength, displayUnit.length + 1, digits + 2) * 4);
	const desktop = new MediaQuery('min-width: 768px');
	const isMobile = $derived(!desktop.current);
	const colorBlockHeight = $derived(isMobile && labeledColors.length >= 20 ? 10 : 20);
	const totalHeight = $derived(colorBlockHeight * labeledColors.length);
</script>

{#if $preferences.showScale}
	{#if isMultiSource && chartSources}
		<!-- ── Multi-source legend ─────────────────────────────────────── -->
		<div
			class="absolute z-60 {$preferences.timeSelector && !desktop.current
				? 'bottom-22.5'
				: 'bottom-2.5'} duration-500 left-2.5 z-10 select-none rounded"
		>
			<div class="flex gap-1 items-end">
				{#each multiSourceScales as { source, colorScale: srcScale, variable: srcVar }, si (srcVar)}
					{@const srcLabeled = getLabeledColorsForLegend(srcScale)}
					{@const srcUnit = getDisplayUnit(srcScale.unit, $unitPreferences)}
					{@const srcUnitOptions = getUnitOptions(srcScale.unit)}
					{@const srcValueLen = String(Math.round(srcLabeled.at(-1)?.value ?? 1)).length}
					{@const srcLabelWidth = 17 + Math.max(srcValueLen, srcUnit.length + 1, digits + 2) * 4}
					{@const srcBlockHeight = isMobile && srcLabeled.length >= 20 ? 10 : 20}

					<div class="flex flex-col items-start gap-0.5">
						<!-- Variable label -->
						<div
							class="text-[9px] leading-tight text-center truncate bg-glass/75 backdrop-blur-sm rounded-t px-1 py-0.5 shadow-md"
							style="max-width: {srcLabelWidth + 4}px;"
							title={prettyVariable(srcVar)}
						>
							{prettyVariable(srcVar)}
						</div>

						{#if source.raster}
							<!-- Color scale bar -->
							<div class="flex flex-col-reverse shadow-md">
								<div class="relative">
									<div class="flex flex-col-reverse bg-glass/30 backdrop-blur-sm rounded-b">
										{#each srcLabeled as lc, i (lc)}
											{@const alphaValue = getAlpha(lc.color)}
											<button
												type="button"
												disabled={!editable && srcScale.type !== 'breakpoint'}
												onclick={(e) => handleColorClick(i, e, si)}
												style={`background: rgb(${lc.color[0]}, ${lc.color[1]}, ${lc.color[2]}); opacity: ${alphaValue}; min-width: 28px; width: ${srcLabelWidth}px; height: ${srcBlockHeight}px;`}
												class="relative border-none outline-none transition-all {editable
													? 'cursor-pointer hover:brightness-110 hover:z-10 hover:ring-3 hover:ring-white/65'
													: 'cursor-default'} {editingSourceIndex === si && editingIndex === i
													? 'ring-2 ring-white/40 z-20'
													: ''}"
												title={editable
													? `Click to change color (opacity: ${Math.round(alphaValue * 100)}%)`
													: undefined}
											>
												<div
													class="absolute inset-0 {i === 0 ? 'rounded-b' : ''}"
													style="background: rgb(${lc.color[0]}, ${lc.color[1]}, ${lc
														.color[2]}); opacity: ${(alphaValue * $opacity) / 100};"
												></div>
											</button>
											{#if editingSourceIndex === si && editingIndex === i}
												<ColorPicker
													color={rgbaToHex(lc.color)}
													alpha={alphaValue}
													onchange={handleColorChange}
													onclose={closePicker}
												/>
											{/if}
										{/each}
									</div>

									<!-- Labels -->
									<div class="flex flex-col-reverse" style="width: {srcLabelWidth}px;">
										{#each srcLabeled as lc, i (lc)}
											{#if i > 0 && !(srcLabeled.length > 20 && i % 2 === 1 && !desktop.current)}
												<div
													class="absolute flex items-center justify-center text-xs z-20 pointer-events-none"
													style={`bottom: ${i * srcBlockHeight - 6}px; height: 12px; width: ${srcLabelWidth}px;
												color: ${textWhite(lc.color, isDark, $opacity) ? 'white' : 'black'};`}
												>
													{formatValueForScale(lc.value, digits, srcScale)}
												</div>
											{/if}
										{/each}
									</div>
								</div>

								<!-- Unit -->
								{#if srcScale.unit}
									<div
										class="bg-glass/75 rounded-t backdrop-blur-sm shadow-md h-6 w-full overflow-hidden text-center text-xs"
									>
										{#if srcUnitOptions}
											<Select.Root
												type="single"
												value={srcUnit}
												onValueChange={(v) => {
													if (v) {
														setUnitForCategory(srcScale.unit, v);
														refreshPopup();
													}
												}}
											>
												<Select.Trigger
													class="h-6! cursor-pointer w-full p-0 text-xs flex items-center justify-center px-1 py-0 gap-0.5 border-none bg-transparent shadow-none focus-visible:ring-0"
													aria-label="Change unit"
													icon={false}
												>
													{srcUnit}
												</Select.Trigger>
												<Select.Content
													side="top"
													class="z-80 left-2.5 border-none bg-glass/65 backdrop-blur-sm rounded min-w-20"
												>
													{#each srcUnitOptions as { value, label } (value)}
														<Select.Item {value} {label} class="cursor-pointer text-xs" />
													{/each}
												</Select.Content>
											</Select.Root>
										{:else}
											<span class="leading-6">{srcUnit}</span>
										{/if}
									</div>
								{/if}
							</div>
						{/if}

						<!-- Contour style bar -->
						{#if source.contours}
							{@const cStyle = getContourStyle(srcVar)}
							<div class="relative flex flex-col shadow-md" style="width: {STYLE_BAR_WIDTH}px;">
								<!-- Header with interval -->
								<div
									class="bg-glass/75 backdrop-blur-sm rounded-t shadow-md flex items-center justify-center gap-0.5 px-1 h-5"
								>
									<span class="text-[8px]">Int:</span>
									<input
										type="number"
										min="1"
										max="100"
										step="1"
										value={source.contourInterval ?? 5}
										onchange={(e) => {
											const val = parseInt(e.currentTarget.value);
											if (val > 0) updateChartSource(si, { contourInterval: val });
										}}
										class="w-7 h-3.5 text-[8px] text-center bg-transparent border border-muted-foreground/30 rounded px-0.5"
									/>
								</div>
								<!-- Levels (weakest at bottom, strongest at top) -->
								<div class="flex flex-col-reverse bg-glass/30 backdrop-blur-sm rounded-b">
									{#each cStyle.levels as level, li}
										{@const color = isDark ? level.darkColor : level.lightColor}
										{@const isEditingThis =
											editingStyle?.type === 'contour' &&
											editingStyle?.variable === srcVar &&
											editingStyle?.levelIndex === li}
										<button
											type="button"
											class="relative flex items-center gap-1 px-1 border-none outline-none transition-all cursor-pointer hover:brightness-125 {isEditingThis
												? 'ring-1 ring-white/40 z-10'
												: ''}"
											style="height: {STYLE_LEVEL_HEIGHT}px;"
											onclick={() => startStyleEdit('contour', srcVar, li)}
											title="Click to edit style"
										>
											<svg width="22" height={STYLE_LEVEL_HEIGHT} class="shrink-0">
												<line
													x1="1"
													y1={STYLE_LEVEL_HEIGHT / 2}
													x2="21"
													y2={STYLE_LEVEL_HEIGHT / 2}
													stroke={color}
													stroke-width={level.width}
												/>
											</svg>
											<span class="text-[8px] leading-none truncate">{level.label}</span>
										</button>
									{/each}
								</div>
								<!-- Editor pane (absolute right) -->
								{#if editingStyle?.type === 'contour' && editingStyle?.variable === srcVar}
									{@const eli = editingStyle.levelIndex}
									{@const elevel = cStyle.levels[eli]}
									{@const ecolor = isDark ? elevel.darkColor : elevel.lightColor}
									<div
										class="absolute left-full ml-1 bottom-0 bg-glass/90 backdrop-blur-sm rounded p-2 flex flex-col gap-1.5 shadow-lg z-30 min-w-28"
									>
										<div class="text-[9px] font-medium">{elevel.label}</div>
										<div class="flex items-center gap-1">
											<span class="text-[8px] w-7 shrink-0">Width</span>
											<input
												type="range"
												min="0.5"
												max="5"
												step="0.1"
												value={elevel.width}
												oninput={(e) =>
													updateContourLevel(srcVar, eli, {
														width: parseFloat(e.currentTarget.value)
													})}
												onchange={applyStyleChanges}
												class="flex-1 h-2 accent-current"
											/>
											<span class="text-[8px] w-5 text-right shrink-0"
												>{elevel.width.toFixed(1)}</span
											>
										</div>
										<div class="flex items-center gap-1">
											<span class="text-[8px] w-7 shrink-0">Alpha</span>
											<input
												type="range"
												min="0"
												max="1"
												step="0.05"
												value={parseRgbaOpacity(ecolor)}
												oninput={(e) => {
													const a = parseFloat(e.currentTarget.value);
													updateContourLevel(srcVar, eli, {
														lightColor: setRgbaOpacity(elevel.lightColor, a),
														darkColor: setRgbaOpacity(elevel.darkColor, a)
													});
												}}
												onchange={applyStyleChanges}
												class="flex-1 h-2 accent-current"
											/>
											<span class="text-[8px] w-5 text-right shrink-0"
												>{parseRgbaOpacity(ecolor).toFixed(2)}</span
											>
										</div>
										<button
											type="button"
											class="text-[8px] text-muted-foreground hover:text-foreground self-end"
											onclick={closeStyleEdit}>Done</button
										>
									</div>
								{/if}
							</div>
						{/if}

						<!-- Arrow style bar -->
						{#if source.arrows}
							{@const aStyle = getArrowStyle(srcVar)}
							<div class="relative flex flex-col shadow-md" style="width: {STYLE_BAR_WIDTH}px;">
								<!-- Header -->
								<div
									class="bg-glass/75 backdrop-blur-sm rounded-t shadow-md flex items-center justify-center px-1 h-5"
								>
									<span class="text-[8px]">Arrows</span>
								</div>
								<!-- Levels (weakest at bottom, strongest at top) -->
								<div class="flex flex-col-reverse bg-glass/30 backdrop-blur-sm rounded-b">
									{#each aStyle.levels as level, li}
										{@const color = isDark ? level.darkColor : level.lightColor}
										{@const isEditingThis =
											editingStyle?.type === 'arrow' &&
											editingStyle?.variable === srcVar &&
											editingStyle?.levelIndex === li}
										<button
											type="button"
											class="relative flex items-center gap-1 px-1 border-none outline-none transition-all cursor-pointer hover:brightness-125 {isEditingThis
												? 'ring-1 ring-white/40 z-10'
												: ''}"
											style="height: {STYLE_LEVEL_HEIGHT}px;"
											onclick={() => startStyleEdit('arrow', srcVar, li)}
											title="Click to edit style"
										>
											<svg width="22" height={STYLE_LEVEL_HEIGHT} class="shrink-0">
												<line
													x1="1"
													y1={STYLE_LEVEL_HEIGHT / 2}
													x2="16"
													y2={STYLE_LEVEL_HEIGHT / 2}
													stroke={color}
													stroke-width={level.width}
												/>
												<polyline
													points="12,{STYLE_LEVEL_HEIGHT / 2 - 4} 16,{STYLE_LEVEL_HEIGHT /
														2} 12,{STYLE_LEVEL_HEIGHT / 2 + 4}"
													fill="none"
													stroke={color}
													stroke-width={Math.min(level.width, 2)}
													stroke-linecap="round"
													stroke-linejoin="round"
												/>
											</svg>
											<span class="text-[8px] leading-none truncate">{level.label}</span>
										</button>
									{/each}
								</div>
								<!-- Editor pane (absolute right) -->
								{#if editingStyle?.type === 'arrow' && editingStyle?.variable === srcVar}
									{@const eli = editingStyle.levelIndex}
									{@const elevel = aStyle.levels[eli]}
									{@const ecolor = isDark ? elevel.darkColor : elevel.lightColor}
									<div
										class="absolute left-full ml-1 bottom-0 bg-glass/90 backdrop-blur-sm rounded p-2 flex flex-col gap-1.5 shadow-lg z-30 min-w-28"
									>
										<div class="text-[9px] font-medium">{elevel.label}</div>
										<div class="flex items-center gap-1">
											<span class="text-[8px] w-7 shrink-0">Width</span>
											<input
												type="range"
												min="0.5"
												max="5"
												step="0.1"
												value={elevel.width}
												oninput={(e) =>
													updateArrowLevel(srcVar, eli, {
														width: parseFloat(e.currentTarget.value)
													})}
												onchange={applyStyleChanges}
												class="flex-1 h-2 accent-current"
											/>
											<span class="text-[8px] w-5 text-right shrink-0"
												>{elevel.width.toFixed(1)}</span
											>
										</div>
										<div class="flex items-center gap-1">
											<span class="text-[8px] w-7 shrink-0">Alpha</span>
											<input
												type="range"
												min="0"
												max="1"
												step="0.05"
												value={parseRgbaOpacity(ecolor)}
												oninput={(e) => {
													const a = parseFloat(e.currentTarget.value);
													updateArrowLevel(srcVar, eli, {
														lightColor: setRgbaOpacity(elevel.lightColor, a),
														darkColor: setRgbaOpacity(elevel.darkColor, a)
													});
												}}
												onchange={applyStyleChanges}
												class="flex-1 h-2 accent-current"
											/>
											<span class="text-[8px] w-5 text-right shrink-0"
												>{parseRgbaOpacity(ecolor).toFixed(2)}</span
											>
										</div>
										<button
											type="button"
											class="text-[8px] text-muted-foreground hover:text-foreground self-end"
											onclick={closeStyleEdit}>Done</button
										>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<!-- ── Single-source legend (original) ────────────────────────── -->
		<div
			class="absolute z-60 {$preferences.timeSelector && !desktop.current
				? 'bottom-22.5'
				: 'bottom-2.5'} duration-500 left-2.5 z-10 select-none rounded"
		>
			<div class="flex flex-col-reverse shadow-md">
				<div class="relative">
					<div class="flex flex-col-reverse bg-glass/30 backdrop-blur-sm rounded-b">
						{#each labeledColors as lc, i (lc)}
							{@const alphaValue = getAlpha(lc.color)}
							<button
								type="button"
								disabled={!editable && colorScale.type !== 'breakpoint'}
								onclick={(e) => handleColorClick(i, e)}
								style={`background: rgb({lc.color[0]}, {lc.color[1]}, {lc
							.color[2]}); opacity: {alphaValue};min-width: 28px; width: ${labelWidth}px; height: ${colorBlockHeight}px;`}
								class="relative border-none outline-none transition-all {editable
									? 'cursor-pointer hover:brightness-110 hover:z-10 hover:ring-3 hover:ring-white/65'
									: 'cursor-default'} {editingIndex === i ? 'ring-2 ring-white/40  z-20' : ''}"
								title={editable
									? `Click to change color (opacity: ${Math.round(alphaValue * 100)}%)`
									: undefined}
							>
								<div
									class="absolute inset-0 {i === 0 ? 'rounded-b' : ''}"
									style="background: rgb({lc.color[0]}, {lc.color[1]}, {lc
										.color[2]}); opacity: {(alphaValue * $opacity) / 100};"
								></div>
							</button>
							<!-- Color Picker Popover -->
							{#if editingIndex === i}
								<ColorPicker
									color={rgbaToHex(lc.color)}
									alpha={alphaValue}
									onchange={handleColorChange}
									onclose={closePicker}
								/>
							{/if}
						{/each}
					</div>

					<!-- Labels column - positioned between buttons -->
					<div class="flex flex-col-reverse" style="width: {labelWidth}px;">
						{#each labeledColors as lc, i (lc)}
							{#if i > 0 && !(labeledColors.length > 20 && i % 2 === 1 && !desktop.current)}
								<div
									class="absolute flex items-center justify-center text-xs z-20 pointer-events-none"
									style={`bottom: ${i * colorBlockHeight - 6}px; height: 12px; width: ${labelWidth}px;
							color: ${textWhite(lc.color, isDark, $opacity) ? 'white' : 'black'};`}
								>
									{formatValue(lc.value, digits)}
								</div>
							{/if}
						{/each}
					</div>
				</div>

				{#if colorScale.unit}
					<div
						class="bg-glass/75 rounded-t backdrop-blur-sm shadow-md h-6 w-full overflow-hidden text-center text-xs"
					>
						{#if unitOptions}
							<Select.Root
								type="single"
								value={displayUnit}
								onValueChange={(v) => {
									if (v) {
										setUnitForCategory(colorScale.unit, v);
										refreshPopup();
									}
								}}
							>
								<Select.Trigger
									class="h-6! cursor-pointer w-full p-0 text-xs flex items-center justify-center px-1 py-0 gap-0.5 border-none bg-transparent shadow-none focus-visible:ring-0"
									aria-label="Change unit"
									icon={false}
								>
									{displayUnit}
								</Select.Trigger>
								<Select.Content
									side="top"
									class="z-80 left-2.5 border-none bg-glass/65 backdrop-blur-sm rounded min-w-20"
								>
									{#each unitOptions as { value, label } (value)}
										<Select.Item {value} {label} class="cursor-pointer text-xs" />
									{/each}
								</Select.Content>
							</Select.Root>
						{:else}
							<span class="leading-6">{displayUnit}</span>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Single-source contour style bar -->
			{#if $vectorOptions.contours}
				{@const cStyle = getContourStyle($variable)}
				<div class="relative flex flex-col shadow-md mt-0.5" style="width: {STYLE_BAR_WIDTH}px;">
					<div
						class="bg-glass/75 backdrop-blur-sm rounded-t shadow-md flex items-center justify-center gap-0.5 px-1 h-5"
					>
						<span class="text-[8px]">Contours</span>
					</div>
					<div class="flex flex-col-reverse bg-glass/30 backdrop-blur-sm rounded-b">
						{#each cStyle.levels as level, li}
							{@const color = isDark ? level.darkColor : level.lightColor}
							{@const isEditingThis =
								editingStyle?.type === 'contour' &&
								editingStyle?.variable === $variable &&
								editingStyle?.levelIndex === li}
							<button
								type="button"
								class="relative flex items-center gap-1 px-1 border-none outline-none transition-all cursor-pointer hover:brightness-125 {isEditingThis
									? 'ring-1 ring-white/40 z-10'
									: ''}"
								style="height: {STYLE_LEVEL_HEIGHT}px;"
								onclick={() => startStyleEdit('contour', $variable, li)}
								title="Click to edit style"
							>
								<svg width="22" height={STYLE_LEVEL_HEIGHT} class="shrink-0">
									<line
										x1="1"
										y1={STYLE_LEVEL_HEIGHT / 2}
										x2="21"
										y2={STYLE_LEVEL_HEIGHT / 2}
										stroke={color}
										stroke-width={level.width}
									/>
								</svg>
								<span class="text-[8px] leading-none truncate">{level.label}</span>
							</button>
						{/each}
					</div>
					{#if editingStyle?.type === 'contour' && editingStyle?.variable === $variable}
						{@const eli = editingStyle.levelIndex}
						{@const elevel = cStyle.levels[eli]}
						{@const ecolor = isDark ? elevel.darkColor : elevel.lightColor}
						<div
							class="absolute left-full ml-1 bottom-0 bg-glass/90 backdrop-blur-sm rounded p-2 flex flex-col gap-1.5 shadow-lg z-30 min-w-28"
						>
							<div class="text-[9px] font-medium">{elevel.label}</div>
							<div class="flex items-center gap-1">
								<span class="text-[8px] w-7 shrink-0">Width</span>
								<input
									type="range"
									min="0.5"
									max="5"
									step="0.1"
									value={elevel.width}
									oninput={(e) =>
										updateContourLevel($variable, eli, {
											width: parseFloat(e.currentTarget.value)
										})}
									onchange={applyStyleChanges}
									class="flex-1 h-2 accent-current"
								/>
								<span class="text-[8px] w-5 text-right shrink-0">{elevel.width.toFixed(1)}</span>
							</div>
							<div class="flex items-center gap-1">
								<span class="text-[8px] w-7 shrink-0">Alpha</span>
								<input
									type="range"
									min="0"
									max="1"
									step="0.05"
									value={parseRgbaOpacity(ecolor)}
									oninput={(e) => {
										const a = parseFloat(e.currentTarget.value);
										updateContourLevel($variable, eli, {
											lightColor: setRgbaOpacity(elevel.lightColor, a),
											darkColor: setRgbaOpacity(elevel.darkColor, a)
										});
									}}
									onchange={applyStyleChanges}
									class="flex-1 h-2 accent-current"
								/>
								<span class="text-[8px] w-5 text-right shrink-0"
									>{parseRgbaOpacity(ecolor).toFixed(2)}</span
								>
							</div>
							<button
								type="button"
								class="text-[8px] text-muted-foreground hover:text-foreground self-end"
								onclick={closeStyleEdit}>Done</button
							>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Single-source arrow style bar -->
			{#if $vectorOptions.arrows}
				{@const aStyle = getArrowStyle($variable)}
				<div class="relative flex flex-col shadow-md mt-0.5" style="width: {STYLE_BAR_WIDTH}px;">
					<div
						class="bg-glass/75 backdrop-blur-sm rounded-t shadow-md flex items-center justify-center px-1 h-5"
					>
						<span class="text-[8px]">Arrows</span>
					</div>
					<div class="flex flex-col-reverse bg-glass/30 backdrop-blur-sm rounded-b">
						{#each aStyle.levels as level, li}
							{@const color = isDark ? level.darkColor : level.lightColor}
							{@const isEditingThis =
								editingStyle?.type === 'arrow' &&
								editingStyle?.variable === $variable &&
								editingStyle?.levelIndex === li}
							<button
								type="button"
								class="relative flex items-center gap-1 px-1 border-none outline-none transition-all cursor-pointer hover:brightness-125 {isEditingThis
									? 'ring-1 ring-white/40 z-10'
									: ''}"
								style="height: {STYLE_LEVEL_HEIGHT}px;"
								onclick={() => startStyleEdit('arrow', $variable, li)}
								title="Click to edit style"
							>
								<svg width="22" height={STYLE_LEVEL_HEIGHT} class="shrink-0">
									<line
										x1="1"
										y1={STYLE_LEVEL_HEIGHT / 2}
										x2="16"
										y2={STYLE_LEVEL_HEIGHT / 2}
										stroke={color}
										stroke-width={level.width}
									/>
									<polyline
										points="12,{STYLE_LEVEL_HEIGHT / 2 - 4} 16,{STYLE_LEVEL_HEIGHT /
											2} 12,{STYLE_LEVEL_HEIGHT / 2 + 4}"
										fill="none"
										stroke={color}
										stroke-width={Math.min(level.width, 2)}
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								<span class="text-[8px] leading-none truncate">{level.label}</span>
							</button>
						{/each}
					</div>
					{#if editingStyle?.type === 'arrow' && editingStyle?.variable === $variable}
						{@const eli = editingStyle.levelIndex}
						{@const elevel = aStyle.levels[eli]}
						{@const ecolor = isDark ? elevel.darkColor : elevel.lightColor}
						<div
							class="absolute left-full ml-1 bottom-0 bg-glass/90 backdrop-blur-sm rounded p-2 flex flex-col gap-1.5 shadow-lg z-30 min-w-28"
						>
							<div class="text-[9px] font-medium">{elevel.label}</div>
							<div class="flex items-center gap-1">
								<span class="text-[8px] w-7 shrink-0">Width</span>
								<input
									type="range"
									min="0.5"
									max="5"
									step="0.1"
									value={elevel.width}
									oninput={(e) =>
										updateArrowLevel($variable, eli, {
											width: parseFloat(e.currentTarget.value)
										})}
									onchange={applyStyleChanges}
									class="flex-1 h-2 accent-current"
								/>
								<span class="text-[8px] w-5 text-right shrink-0">{elevel.width.toFixed(1)}</span>
							</div>
							<div class="flex items-center gap-1">
								<span class="text-[8px] w-7 shrink-0">Alpha</span>
								<input
									type="range"
									min="0"
									max="1"
									step="0.05"
									value={parseRgbaOpacity(ecolor)}
									oninput={(e) => {
										const a = parseFloat(e.currentTarget.value);
										updateArrowLevel($variable, eli, {
											lightColor: setRgbaOpacity(elevel.lightColor, a),
											darkColor: setRgbaOpacity(elevel.darkColor, a)
										});
									}}
									onchange={applyStyleChanges}
									class="flex-1 h-2 accent-current"
								/>
								<span class="text-[8px] w-5 text-right shrink-0"
									>{parseRgbaOpacity(ecolor).toFixed(2)}</span
								>
							</div>
							<button
								type="button"
								class="text-[8px] text-muted-foreground hover:text-foreground self-end"
								onclick={closeStyleEdit}>Done</button
							>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
{/if}
