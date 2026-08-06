<script lang="ts">
	import { type ArrowStyle, DEFAULT_ARROW_STYLE } from '@openmeteo/weather-map-layer';
	import { toast } from 'svelte-sonner';

	import { setArrowsOnActiveChart } from '$lib/stores/chart';
	import { vectorOptions } from '$lib/stores/vector';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { changeOMfileURL } from '$lib/layers';
	import { updateUrl } from '$lib/url';

	/**
	 * Previews drawn to the same proportions the tile generators use, in a
	 * 100-unit box standing for one lattice cell: `generateArrows` for the
	 * arrow, `generateWindBarbs` for the barb, which shows one of each element,
	 * i.e. 65 knots.
	 */
	const styles: { value: ArrowStyle; label: string; hint: string; path: string }[] = [
		{
			value: 'arrow',
			label: 'Arrows',
			hint: 'Length and weight grow with the speed',
			path: 'M50 92.5L50 7.5M37 29.5L50 7.5L63 29.5'
		},
		{
			value: 'barb',
			label: 'Wind barbs',
			hint: 'Pennant 50, barb 10, half barb 5 knots',
			path: 'M50 82.4L50 17.6M50 17.6L70.1 7.5L50 37.6M50 37.6L70.1 27.6M50 47.7L60 42.7'
		}
	];

	let arrows = $derived($vectorOptions.arrows);
	let arrowStyle = $derived($vectorOptions.arrowStyle);

	const setArrowStyle = (style: ArrowStyle) => {
		if (style === $vectorOptions.arrowStyle) return;
		$vectorOptions.arrowStyle = style;
		// The store key is `arrowStyle`, so the default has to be passed in for
		// the param to drop out of the URL again
		updateUrl('arrow_style', style, DEFAULT_ARROW_STYLE);
		changeOMfileURL();
	};
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
				// Applies to every capable source, also on presets/saved charts
				setArrowsOnActiveChart(arrows);
				changeOMfileURL();
				toast.info('Arrows turned ' + (arrows ? 'on' : 'off'));
			}}
		/>
		<Label class="cursor-pointer" for="arrows">Arrows {arrows ? 'on' : 'off'}</Label>
	</div>

	<h3 class="mt-4 font-semibold">Style</h3>
	<div class="mt-2 flex flex-wrap gap-3" role="radiogroup" aria-label="Arrow style">
		{#each styles as style (style.value)}
			{@const selected = arrowStyle === style.value}
			<button
				type="button"
				role="radio"
				aria-checked={selected}
				disabled={!arrows}
				title={style.hint}
				class="bg-primary/5 hover:bg-primary/10 flex cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 duration-150 disabled:cursor-not-allowed disabled:opacity-40 {selected
					? 'ring-primary/60 bg-primary/10 ring-2'
					: ''}"
				onclick={() => setArrowStyle(style.value)}
			>
				<svg
					viewBox="0 0 100 100"
					class="size-9 shrink-0"
					fill="none"
					stroke="currentColor"
					stroke-width="5"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d={style.path} />
				</svg>
				<span class="text-xs font-medium">{style.label}</span>
			</button>
		{/each}
	</div>
	<p class="mt-1 text-xs opacity-60">
		A barb's staff points into the wind; barbs sit on its upwind end and mirror south of the
		equator.
	</p>
</div>
