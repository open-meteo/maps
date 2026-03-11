<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';

	import { type RenderableColorScale, getColor, getColorScale } from '@openmeteo/mapbox-layer';
	import { mode } from 'mode-watcher';

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

	import * as Select from '$lib/components/ui/select';

	import { getAlpha, hexToRgba, rgbaToHex } from '$lib/color';
	import { textWhite } from '$lib/helpers';
	import { refreshPopup } from '$lib/popup';

	import ColorPicker from './color-picker.svelte';

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

	const handleColorClick = (index: number, e: MouseEvent) => {
		if (!editable) return;
		e.stopPropagation();

		editingIndex = index;
	};

	const handleColorChange = (newHex: string, newAlpha: number) => {
		if (editingIndex === null) return;

		const newScale = structuredClone(colorScale);
		const newColor = hexToRgba(newHex, newAlpha);

		if (newScale.colors) {
			newScale.colors[editingIndex] = newColor;
		}

		customColorScales.update((scales) => ({
			...scales,
			[$variable]: newScale
		}));
		// console.log(`customColorScales[${$variable}]: `, JSON.stringify($customColorScales[$variable]));
		afterColorScaleChange($variable, newScale);
	};

	const closePicker = () => {
		editingIndex = null;
	};

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
	<div
		class="absolute z-60 'bottom-22.5' duration-500 left-2.5 select-none rounded"
		style="max-height: {totalHeight + 100}px;"
	>
		<div class="flex flex-col-reverse shadow-md">
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
	</div>
{/if}
