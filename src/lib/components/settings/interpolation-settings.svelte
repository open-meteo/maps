<script lang="ts">
	import { get } from 'svelte/store';

	import { colorBlend as cB, interpolation as iP } from '$lib/stores/preferences';

	import Button from '$lib/components/ui/button/button.svelte';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { changeOMfileURL } from '$lib/layers';

	import type { InterpolationMethod } from '@openmeteo/weather-map-layer';

	// `cost` is the approximate render cost relative to nearest-neighbour.
	const methods: { value: InterpolationMethod; label: string; cost: number }[] = [
		{ value: 'nearest', label: 'Nearest', cost: 1 },
		{ value: 'cubic', label: 'Cubic', cost: 1.6 },
		{ value: 'linear', label: 'Linear', cost: 2.1 },
		{ value: 'monotone', label: 'Monotone', cost: 2.4 }
	];

	let interpolation = $derived($iP);
	let colorBlend = $derived($cB);

	const setInterpolation = (method: InterpolationMethod) => {
		iP.set(method);
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
		How raster pixels are sampled between grid points. Cubic removes bilinear faceting; Monotone is
		shape-preserving cubic (smooth but never overshoots).
	</p>
	<div class="mt-3 flex flex-wrap gap-3">
		{#each methods as method (method.value)}
			<Button
				class="min-w-24 cursor-pointer {interpolation === method.value
					? 'bg-primary'
					: 'bg-primary/75'}"
				onclick={() => setInterpolation(method.value)}
				>{method.label}<span class="ml-1 text-xs opacity-60">{method.cost}×</span></Button
			>
		{/each}
	</div>
	<p class="mt-1 text-xs opacity-60">×N = approx. render cost relative to nearest</p>

	<h3 class="mt-4 font-semibold">Colour blending</h3>
	<p class="text-xs opacity-75">
		Interpolate colours between bands instead of hard steps — anti-aliases band edges.
	</p>
	<div class="mt-2 flex cursor-pointer gap-3">
		<Switch id="color-blend" checked={colorBlend} onCheckedChange={toggleColorBlend} />
		<Label for="color-blend">Blend between bands {colorBlend ? 'on' : 'off'}</Label>
	</div>
</div>
