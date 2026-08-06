<script lang="ts">
	import { tick } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';

	import { type RenderableColorScale, getColor, getColorScale } from '@openmeteo/weather-map-layer';
	import { mode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';

	import { customColorScales, omProtocolSettings } from '$lib/stores/om-protocol-settings';
	import { opacity } from '$lib/stores/preferences';
	import {
		convertValue,
		getDisplayUnit,
		getUnitOptions,
		setUnitForCategory,
		unitPreferences
	} from '$lib/stores/units';

	import * as Select from '$lib/components/ui/select';

	import { getAlpha, hexToRgba, rgbaToHex } from '$lib/color';
	import { textWhite } from '$lib/helpers';
	import { changeOMfileURL } from '$lib/layers';
	import { refreshPopup } from '$lib/popup';

	import ColorPicker from './color-picker.svelte';

	interface Props {
		variable: string;
		editable?: boolean;
		/** Smaller blocks/labels, used when several legends compete for space. */
		compact?: boolean;
		/** Variable name shown vertically beside the bar (multi-scale charts). */
		label?: string;
	}

	let { variable, editable = true, compact = false, label = undefined }: Props = $props();

	const isDark = $derived(mode.current === 'dark');
	const baseColorScale: RenderableColorScale = $derived(getColorScale(variable, isDark));
	// Use custom scale if available, otherwise use base
	const colorScale = $derived($customColorScales[variable] ?? baseColorScale);

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

	const handleColorChange = async (newHex: string, newAlpha: number) => {
		if (editingIndex === null) return;

		const newScale = structuredClone(colorScale);
		const newColor = hexToRgba(newHex, newAlpha);

		if (newScale.colors) {
			newScale.colors[editingIndex] = newColor;
		}

		customColorScales.update((scales) => ({
			...scales,
			[variable]: newScale
		}));
		// Replace wholesale, never mutate: the om URL builder memoizes the
		// color hash by object identity
		$omProtocolSettings.colorScales = { ...$omProtocolSettings.colorScales, [variable]: newScale };
		await tick();
		await changeOMfileURL();
		toast('Changed color scale');
	};

	const closePicker = () => {
		editingIndex = null;
	};

	const digits = 2;
	const labeledColors = $derived(getLabeledColorsForLegend(colorScale));
	const displayUnit = $derived(getDisplayUnit(colorScale.unit, $unitPreferences));
	const unitOptions = $derived(getUnitOptions(colorScale.unit));
	const valueLength = $derived(String(Math.round(labeledColors.at(-1)?.value ?? 1)).length);
	const labelWidth = $derived(
		compact
			? 6 + Math.max(valueLength, displayUnit.length, digits + 1) * 2.8
			: 17 + Math.max(valueLength, displayUnit.length + 1, digits + 2) * 4
	);
	const desktop = new MediaQuery('min-width: 768px');
	const isMobile = $derived(!desktop.current);
	const colorBlockHeight = $derived.by(() => {
		if (compact) return labeledColors.length >= 20 ? 7 : 12;
		return isMobile && labeledColors.length >= 20 ? 10 : 20;
	});
	const totalHeight = $derived(colorBlockHeight * labeledColors.length);
</script>

<!-- Lifted while editing: legends are siblings at z-auto, so the picker of one
	legend would otherwise paint under the legends after it -->
<div
	class="relative flex items-end gap-0.5 select-none {editingIndex !== null ? 'z-50' : ''}"
	style="max-height: {totalHeight + 100}px;"
>
	<div class="flex flex-col-reverse rounded shadow-md">
		<div class="flex flex-col-reverse bg-glass/30 backdrop-blur-sm rounded-b">
			{#each labeledColors as lc, i (lc.index)}
				{@const alphaValue = getAlpha(lc.color)}
				<button
					type="button"
					disabled={!editable && colorScale.type !== 'breakpoint'}
					onclick={(e) => handleColorClick(i, e)}
					style={`min-width: ${compact ? 16 : 28}px; width: ${labelWidth}px; height: ${colorBlockHeight}px;`}
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
			{/each}
		</div>

		<!-- Labels column - positioned between buttons -->
		<div class="flex flex-col-reverse" style="width: {labelWidth}px;">
			{#each labeledColors as lc, i (lc.index)}
				{#if i > 0 && !(labeledColors.length > 20 && i % 2 === 1 && !desktop.current)}
					<div
						class="absolute flex items-center justify-center {compact
							? 'text-[9px]'
							: 'text-xs'} z-20 pointer-events-none"
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
				class="bg-glass/75 rounded-t backdrop-blur-sm shadow-md w-full overflow-hidden text-center {compact
					? 'h-4 text-[9px]'
					: 'h-6 text-xs'}"
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
							class="{compact
								? 'h-4! text-[9px]'
								: 'h-6! text-xs'} cursor-pointer w-full p-0 flex items-center justify-center px-0.5 py-0 gap-0.5 border-none bg-transparent shadow-none focus-visible:ring-0"
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
					<span class={compact ? 'leading-4' : 'leading-6'}>{displayUnit}</span>
				{/if}
			</div>
		{/if}
	</div>
	{#if label}
		<div
			class="bg-glass/60 text-foreground/80 overflow-hidden rounded-sm px-1 py-px font-semibold backdrop-blur-sm {compact
				? 'text-[9px]'
				: 'text-[10px]'}"
			style="writing-mode: vertical-rl; transform: rotate(180deg); max-height: {totalHeight}px;"
			title={label}
		>
			{label}
		</div>
	{/if}

	<!-- Color picker popover. A child of the legend root, not of the colour
		column: that column's backdrop blur traps its descendants in a stacking
		context, under the value labels and the legends beside it. -->
	{#if editingIndex !== null && labeledColors[editingIndex]}
		{@const editing = labeledColors[editingIndex]}
		<ColorPicker
			color={rgbaToHex(editing.color)}
			alpha={getAlpha(editing.color)}
			onchange={handleColorChange}
			onclose={closePicker}
		/>
	{/if}
</div>
