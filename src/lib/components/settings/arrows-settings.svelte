<script lang="ts">
	import { type ArrowStyle, DEFAULT_ARROW_STYLE } from '@openmeteo/weather-map-layer';
	import { mode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';

	import { setArrowsOnActiveChart } from '$lib/stores/chart';
	import { convertValue, getDisplayUnit, unitPreferences } from '$lib/stores/units';
	import { defaultVectorOptions, vectorOptions } from '$lib/stores/vector';

	import Button from '$lib/components/ui/button/button.svelte';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { MS_TO_KNOTS, SHAPE_UNITS, arrowShape, barbShape, shapePath } from '$lib/arrow-shapes';
	import {
		ICON_PACKING_RANGE,
		ICON_SCALE_RANGE,
		shapeColor,
		shapeStrokeUnits,
		windIconSizePx,
		windIconSpacing
	} from '$lib/arrow-sprites';
	import { changeOMfileURL } from '$lib/layers';
	import { updateUrl } from '$lib/url';

	import SettingsSection from './settings-section.svelte';
	import WindRose from './wind-rose.svelte';

	interface Sample {
		label: string;
		path: string;
		fill?: string;
		stroke: number;
		/** The colour the map draws this speed in, opacity ramp and all. */
		color: string;
	}

	/**
	 * A barb's staff points into the wind and an arrow points downwind, so the
	 * two scales would read as opposite directions side by side. The barb scale
	 * is turned round to match the arrows, since a legend is about the shape.
	 */
	const BARB_LEGEND_ROTATION = `rotate(180 ${SHAPE_UNITS / 2} ${SHAPE_UNITS / 2})`;

	/** Speeds the scales are drawn at: m/s for arrows, knots for barbs. */
	const ARROW_SCALE = [1, 3, 5, 10, 20];
	const BARB_SCALE = [0, 5, 15, 25, 50, 65];

	/** Direction the rose beside the barb scale shows: a wind out of the south-east. */
	const EXPLAINER_DIRECTION = 135;

	// Scales built from the shapes the map itself draws, at the weights it draws
	// them with, so the legend cannot drift away from the map
	const dark = $derived(mode.current === 'dark');
	const arrowSamples: Sample[] = $derived(
		ARROW_SCALE.map((speed) => ({
			label: convertValue(speed, 'm/s', $unitPreferences).toFixed(0),
			path: shapePath(arrowShape(speed)),
			stroke: shapeStrokeUnits('arrow', speed),
			color: shapeColor('arrow', speed, dark)
		}))
	);
	const barbSamples: Sample[] = $derived(
		BARB_SCALE.map((knots) => {
			const shape = barbShape(knots);
			return {
				label: knots === 0 ? 'calm' : String(knots),
				path: shapePath(shape.lines),
				fill: shapePath(shape.pennants),
				// The calm rings are two closed curves and read heavier than a staff
				// at the same weight, so they are drawn a little finer
				stroke: shapeStrokeUnits('barb', knots / MS_TO_KNOTS) * (knots === 0 ? 0.7 : 1),
				color: shapeColor('barb', knots / MS_TO_KNOTS, dark)
			};
		})
	);

	let arrows = $derived($vectorOptions.arrows);
	let arrowStyle = $derived($vectorOptions.arrowStyle);
	let uniformSize = $derived($vectorOptions.arrowRender === 'icon');
	let iconSizePx = $derived(windIconSizePx(arrowStyle, $vectorOptions.arrowIconScale));
	let iconSpacingPx = $derived(
		windIconSpacing(arrowStyle, $vectorOptions.arrowIconScale, $vectorOptions.arrowPacking)
	);

	const styles = $derived([
		{
			value: 'arrow' as ArrowStyle,
			label: 'Arrows',
			description: 'Points downwind. Length, weight and opacity grow with the speed.',
			unit: getDisplayUnit('m/s', $unitPreferences),
			samples: arrowSamples
		},
		{
			value: 'barb' as ArrowStyle,
			label: 'Wind barbs',
			description:
				'The staff points into the wind, barbs on its upwind end: half barb 5 knots, full barb 10, pennant 50. South of the equator they sit on the other side of the staff.',
			unit: 'kt',
			samples: barbSamples
		}
	]);

	const setArrowStyle = (style: ArrowStyle) => {
		if (style === $vectorOptions.arrowStyle) return;
		$vectorOptions.arrowStyle = style;
		// The store key is `arrowStyle`, so the default has to be passed in for
		// the param to drop out of the URL again
		updateUrl('arrow_style', style, DEFAULT_ARROW_STYLE);
		changeOMfileURL();
	};

	const atDefaultSizing = $derived(
		$vectorOptions.arrowIconScale === defaultVectorOptions.arrowIconScale &&
			$vectorOptions.arrowPacking === defaultVectorOptions.arrowPacking
	);

	const resetSizing = () => {
		$vectorOptions.arrowIconScale = defaultVectorOptions.arrowIconScale;
		$vectorOptions.arrowPacking = defaultVectorOptions.arrowPacking;
		changeOMfileURL();
	};

	const toggleUniformSize = (checked: boolean) => {
		$vectorOptions.arrowRender = checked ? 'icon' : 'line';
		updateUrl('arrow_render', $vectorOptions.arrowRender, 'line');
		changeOMfileURL();
	};
</script>

<SettingsSection title="Arrows settings">
	<div class="mt-3 flex gap-3">
		<Switch
			id="arrows"
			class="cursor-pointer"
			bind:checked={$vectorOptions.arrows}
			onCheckedChange={() => {
				updateUrl('arrows', String(arrows));
				// Applies to every capable source, also on presets/saved charts
				setArrowsOnActiveChart(arrows);
				changeOMfileURL();
				toast.info('Arrows turned ' + (arrows ? 'on' : 'off'));
			}}
		/>
		<Label class="cursor-pointer" for="arrows">Arrows {arrows ? 'on' : 'off'}</Label>
	</div>

	<div class="mt-3 flex flex-col gap-2" role="radiogroup" aria-label="Arrow style">
		{#each styles as style (style.value)}
			{@const selected = arrowStyle === style.value}
			<button
				type="button"
				role="radio"
				aria-checked={selected}
				disabled={!arrows}
				class="bg-primary/5 hover:bg-primary/10 flex w-full cursor-pointer flex-col gap-1.5 rounded p-2.5 text-left duration-150 disabled:cursor-not-allowed disabled:opacity-40 {selected
					? 'ring-primary/60 bg-primary/10 ring-2'
					: ''}"
				onclick={() => setArrowStyle(style.value)}
			>
				<span class="text-sm font-semibold">{style.label}</span>
				<div class="flex w-full flex-wrap items-end gap-1">
					{#each style.samples as sample (sample.label)}
						<div class="flex w-9 flex-col items-center gap-0.5">
							<svg
								viewBox="0 0 {SHAPE_UNITS} {SHAPE_UNITS}"
								class="size-9"
								fill="none"
								stroke={sample.color}
								stroke-width={sample.stroke}
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<g transform={style.value === 'barb' ? BARB_LEGEND_ROTATION : undefined}>
									<path d={sample.path} />
									{#if sample.fill}
										<path d={sample.fill} fill={sample.color} />
									{/if}
								</g>
							</svg>
							<span class="text-[9px] leading-none opacity-60">{sample.label}</span>
						</div>
					{/each}
					<div class="flex flex-col items-center gap-0.5">
						<span class="text-[9px] leading-none opacity-60">{style.unit}</span>
					</div>
				</div>
				<div class="flex items-center gap-2">
					<p class="flex-1 text-xs leading-snug opacity-70">{style.description}</p>
					{#if style.value === 'barb'}
						<WindRose direction={EXPLAINER_DIRECTION} knots={25} />
					{/if}
				</div>
			</button>
		{/each}
	</div>

	<h3 class="mt-4 font-semibold">Sizing</h3>
	<p class="text-xs opacity-75">
		Drawn into the map tiles, arrows grow while you zoom in and snap back when the next zoom level
		loads. As symbols they keep one size on screen.
	</p>
	<div class="mt-2 flex gap-3">
		<Switch
			id="arrow-uniform"
			class="cursor-pointer"
			checked={uniformSize}
			disabled={!arrows}
			onCheckedChange={toggleUniformSize}
		/>
		<Label class="cursor-pointer" for="arrow-uniform">
			Uniform size {uniformSize ? 'on' : 'off'}
		</Label>
	</div>

	{#if uniformSize}
		<div class="mt-3 flex flex-col gap-2">
			<div class="flex items-center gap-3">
				<Label class="w-16 shrink-0" for="arrow-size">Size</Label>
				<input
					id="arrow-size"
					type="range"
					class="w-28"
					min={ICON_SCALE_RANGE.min}
					max={ICON_SCALE_RANGE.max}
					step={ICON_SCALE_RANGE.step}
					bind:value={$vectorOptions.arrowIconScale}
					onchange={changeOMfileURL}
				/>
				<span class="text-xs opacity-70">{iconSizePx.toFixed(1)} px</span>
			</div>
			<div class="flex items-center gap-3">
				<Label class="w-16 shrink-0" for="arrow-packing">Spacing</Label>
				<input
					id="arrow-packing"
					type="range"
					class="w-28"
					min={ICON_PACKING_RANGE.min}
					max={ICON_PACKING_RANGE.max}
					step={ICON_PACKING_RANGE.step}
					bind:value={$vectorOptions.arrowPacking}
					onchange={changeOMfileURL}
				/>
				<span class="text-xs opacity-70">{iconSpacingPx.toFixed(1)} px apart</span>
			</div>
			<Button
				class="mt-1 h-7 w-fit cursor-pointer text-xs"
				variant="secondary"
				disabled={atDefaultSizing}
				onclick={resetSizing}
			>
				Reset to default
			</Button>
			<p class="text-xs opacity-60">
				Both snap to a whole number of cells across a tile, so the size shown is the size drawn.
				Tile geometry is drawn between 0.7x and 1.4x its nominal size through a zoom level; the
				default sits near the middle of that, so icons read like the geometry does.
			</p>
		</div>
	{/if}
</SettingsSection>
