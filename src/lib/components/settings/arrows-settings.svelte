<script lang="ts">
	import { DEFAULT_ARROW_STYLE } from '@openmeteo/weather-map-layer';
	import { mode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';

	import { setArrowsOnActiveChart } from '$lib/stores/chart';
	import { convertValue, getDisplayUnit, unitPreferences } from '$lib/stores/units';
	import { type WindStyle, defaultVectorOptions, vectorOptions } from '$lib/stores/vector';

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
	// The sizing helpers only know the icon alphabets; the sizing section is
	// hidden for the particle style, so the fallback value is never shown.
	let iconStyle = $derived(arrowStyle === 'particles' ? ('arrow' as const) : arrowStyle);
	let uniformSize = $derived($vectorOptions.arrowRender === 'icon');
	let iconSizePx = $derived(windIconSizePx(iconStyle, $vectorOptions.arrowIconScale));
	let iconSpacingPx = $derived(
		windIconSpacing(iconStyle, $vectorOptions.arrowIconScale, $vectorOptions.arrowPacking)
	);

	const styles = $derived([
		{
			value: 'arrow' as WindStyle,
			label: 'Arrows',
			description: 'Points downwind. Length, weight and opacity grow with the speed.',
			unit: getDisplayUnit('m/s', $unitPreferences),
			samples: arrowSamples
		},
		{
			value: 'barb' as WindStyle,
			label: 'Wind barbs',
			description:
				'The staff points into the wind, barbs on its upwind end: half barb 5 knots, full barb 10, pennant 50. South of the equator they sit on the other side of the staff.',
			unit: 'kt',
			samples: barbSamples
		},
		{
			value: 'particles' as WindStyle,
			label: 'Animated flow',
			description:
				'Particles drift downwind and leave fading trails that trace the streamlines. The flow speed on screen is the same at every zoom; the colour scale underneath carries the magnitude.',
			unit: '',
			samples: []
		}
	]);

	const setArrowStyle = (style: WindStyle) => {
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

	// Animated-flow tuning. Trail persistence is per 60fps frame, so useful
	// values crowd near 1; the slider walks that end in small steps.
	const PARTICLE_COUNT_RANGE = { min: 1000, max: 30000, step: 500 };
	const PARTICLE_SIZE_RANGE = { min: 0.8, max: 4, step: 0.1 };
	const PARTICLE_SPEED_RANGE = { min: 0.4, max: 4, step: 0.1 };
	const PARTICLE_TRAIL_RANGE = { min: 0.9, max: 0.995, step: 0.005 };
	const PARTICLE_OPACITY_RANGE = { min: 0.1, max: 1, step: 0.05 };

	/** Trail length as the ~px a 10 m/s trail glows before fading below 10%. */
	const trailLabel = $derived.by(() => {
		const perFrame = ($vectorOptions.particleSpeed * 10) / 60;
		const frames = Math.log(0.1) / Math.log($vectorOptions.particleTrail);
		return `~${Math.round(perFrame * frames)} px at 10 m/s`;
	});

	const atDefaultAnimation = $derived(
		$vectorOptions.particleCount === defaultVectorOptions.particleCount &&
			$vectorOptions.particleSize === defaultVectorOptions.particleSize &&
			$vectorOptions.particleSpeed === defaultVectorOptions.particleSpeed &&
			$vectorOptions.particleTrail === defaultVectorOptions.particleTrail &&
			$vectorOptions.particleOpacity === defaultVectorOptions.particleOpacity
	);

	const resetAnimation = () => {
		$vectorOptions.particleCount = defaultVectorOptions.particleCount;
		$vectorOptions.particleSize = defaultVectorOptions.particleSize;
		$vectorOptions.particleSpeed = defaultVectorOptions.particleSpeed;
		$vectorOptions.particleTrail = defaultVectorOptions.particleTrail;
		$vectorOptions.particleOpacity = defaultVectorOptions.particleOpacity;
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
				{#if style.value === 'particles'}
					<!-- Static comet-trail sketch of what the animation draws. -->
					<svg
						viewBox="0 0 120 28"
						class="h-7 w-30"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						aria-hidden="true"
					>
						<path d="M4 22 C 30 20, 55 13, 80 10" opacity="0.3" />
						<circle cx="80" cy="10" r="1.6" fill="currentColor" stroke="none" opacity="0.9" />
						<path d="M16 6 C 42 7, 62 13, 94 16" opacity="0.3" />
						<circle cx="94" cy="16" r="1.6" fill="currentColor" stroke="none" opacity="0.9" />
						<path d="M40 24 C 62 23, 80 18, 108 12" opacity="0.3" />
						<circle cx="108" cy="12" r="1.6" fill="currentColor" stroke="none" opacity="0.9" />
					</svg>
				{/if}
				<div
					class="flex w-full flex-wrap items-end gap-1"
					class:hidden={style.samples.length === 0}
				>
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

	{#if arrowStyle !== 'particles'}
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
	{:else}
		<h3 class="mt-4 font-semibold">Animation</h3>
		<p class="text-xs opacity-75">
			The flow keeps the same screen speed at every zoom; density is per screen, not per area.
		</p>
		<div class="mt-2 flex flex-col gap-2">
			<div class="flex items-center gap-3">
				<Label class="w-16 shrink-0" for="particle-count">Density</Label>
				<input
					id="particle-count"
					type="range"
					class="w-28"
					min={PARTICLE_COUNT_RANGE.min}
					max={PARTICLE_COUNT_RANGE.max}
					step={PARTICLE_COUNT_RANGE.step}
					disabled={!arrows}
					bind:value={$vectorOptions.particleCount}
					onchange={changeOMfileURL}
				/>
				<span class="text-xs opacity-70">
					{($vectorOptions.particleCount / 1000).toFixed(1)}k particles
				</span>
			</div>
			<div class="flex items-center gap-3">
				<Label class="w-16 shrink-0" for="particle-size">Size</Label>
				<input
					id="particle-size"
					type="range"
					class="w-28"
					min={PARTICLE_SIZE_RANGE.min}
					max={PARTICLE_SIZE_RANGE.max}
					step={PARTICLE_SIZE_RANGE.step}
					disabled={!arrows}
					bind:value={$vectorOptions.particleSize}
					onchange={changeOMfileURL}
				/>
				<span class="text-xs opacity-70">{$vectorOptions.particleSize.toFixed(1)} px wide</span>
			</div>
			<div class="flex items-center gap-3">
				<Label class="w-16 shrink-0" for="particle-opacity">Opacity</Label>
				<input
					id="particle-opacity"
					type="range"
					class="w-28"
					min={PARTICLE_OPACITY_RANGE.min}
					max={PARTICLE_OPACITY_RANGE.max}
					step={PARTICLE_OPACITY_RANGE.step}
					disabled={!arrows}
					bind:value={$vectorOptions.particleOpacity}
					onchange={changeOMfileURL}
				/>
				<span class="text-xs opacity-70">
					{Math.round($vectorOptions.particleOpacity * 100)}%
				</span>
			</div>
			<div class="flex items-center gap-3">
				<Label class="w-16 shrink-0" for="particle-speed">Speed</Label>
				<input
					id="particle-speed"
					type="range"
					class="w-28"
					min={PARTICLE_SPEED_RANGE.min}
					max={PARTICLE_SPEED_RANGE.max}
					step={PARTICLE_SPEED_RANGE.step}
					disabled={!arrows}
					bind:value={$vectorOptions.particleSpeed}
					onchange={changeOMfileURL}
				/>
				<span class="text-xs opacity-70">
					{$vectorOptions.particleSpeed.toFixed(1)} px/s per m/s
				</span>
			</div>
			<div class="flex items-center gap-3">
				<Label class="w-16 shrink-0" for="particle-trail">Trails</Label>
				<input
					id="particle-trail"
					type="range"
					class="w-28"
					min={PARTICLE_TRAIL_RANGE.min}
					max={PARTICLE_TRAIL_RANGE.max}
					step={PARTICLE_TRAIL_RANGE.step}
					disabled={!arrows}
					bind:value={$vectorOptions.particleTrail}
					onchange={changeOMfileURL}
				/>
				<span class="text-xs opacity-70">{trailLabel}</span>
			</div>
			<Button
				class="mt-1 h-7 w-fit cursor-pointer text-xs"
				variant="secondary"
				disabled={atDefaultAnimation}
				onclick={resetAnimation}
			>
				Reset to default
			</Button>
		</div>
	{/if}
</SettingsSection>
