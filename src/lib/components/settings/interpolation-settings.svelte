<script lang="ts">
	import { get } from 'svelte/store';

	import {
		colorBlend as cB,
		interpolation as iP,
		smoothFootprint as sF
	} from '$lib/stores/preferences';

	import Button from '$lib/components/ui/button/button.svelte';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { SMOOTH_FOOTPRINT_OPTIONS } from '$lib/constants';
	import { changeOMfileURL } from '$lib/layers';

	import type { InterpolationMethod } from '@openmeteo/weather-map-layer';

	// 'none' is nearest-neighbour (no interpolation); 'nearest' is kept as a
	// hidden alias for backwards compatibility with persisted/shared values.
	const methods: { value: InterpolationMethod; label: string }[] = [
		{ value: 'none', label: 'None' },
		{ value: 'linear', label: 'Linear' },
		{ value: 'cubic', label: 'Cubic' },
		{ value: 'smooth', label: 'Smooth' }
	];

	let interpolation = $state(get(iP));
	let smoothFootprint = $state(get(sF));
	let colorBlend = $state(get(cB));

	iP.subscribe((v) => (interpolation = v));
	sF.subscribe((v) => (smoothFootprint = v));
	cB.subscribe((v) => (colorBlend = v));

	const setInterpolation = (method: InterpolationMethod) => {
		iP.set(method);
		changeOMfileURL();
	};

	const setSmoothFootprint = (cells: number) => {
		sF.set(cells);
		changeOMfileURL();
	};

	const toggleColorBlend = () => {
		cB.set(!get(cB));
		changeOMfileURL();
	};
</script>

<div>
	<h2 class="text-lg font-bold">Interpolation</h2>
	<p class="mt-1 text-sm opacity-75">
		How raster pixels are sampled between grid points. Cubic removes bilinear faceting; Smooth
		area-averages (∝ 1/cos lat) to blend out the regridding blocks that grow towards the poles.
	</p>
	<div class="mt-3 flex flex-wrap gap-3">
		{#each methods as method (method.value)}
			<Button
				class="min-w-24 cursor-pointer {interpolation === method.value
					? 'bg-primary'
					: 'bg-primary/75'}"
				onclick={() => setInterpolation(method.value)}>{method.label}</Button
			>
		{/each}
	</div>

	{#if interpolation === 'smooth'}
		<h3 class="mt-4 font-semibold">Smooth strength</h3>
		<p class="text-xs opacity-75">Area-average footprint in grid cells.</p>
		<div class="mt-2 flex flex-wrap gap-3">
			{#each SMOOTH_FOOTPRINT_OPTIONS as cells (cells)}
				<Button
					class="min-w-16 cursor-pointer {smoothFootprint === cells
						? 'bg-primary'
						: 'bg-primary/75'}"
					onclick={() => setSmoothFootprint(cells)}>{cells}</Button
				>
			{/each}
		</div>
	{/if}

	<h3 class="mt-4 font-semibold">Colour blending</h3>
	<p class="text-xs opacity-75">
		Interpolate colours between bands instead of hard steps — anti-aliases band edges.
	</p>
	<div class="mt-2 flex cursor-pointer gap-3">
		<Switch id="color-blend" checked={colorBlend} onCheckedChange={toggleColorBlend} />
		<Label for="color-blend">Blend between bands {colorBlend ? 'on' : 'off'}</Label>
	</div>
</div>
