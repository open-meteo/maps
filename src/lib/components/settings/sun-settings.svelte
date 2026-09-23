<script lang="ts">
	import {
		DEFAULT_SUN_SHADOW_COLOR,
		DEFAULT_SUN_SHADOW_GRADIENT,
		DEFAULT_SUN_SHADOW_OPACITY
	} from '@openmeteo/weather-map-layer';

	import { sunShadow } from '$lib/stores/sun';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { updateSunLayer } from '$lib/layers';
	import { updateUrl } from '$lib/url';

	const defaultColorHex = DEFAULT_SUN_SHADOW_COLOR.map((channel) =>
		channel.toString(16).padStart(2, '0')
	).join('');

	const shadow = $derived($sunShadow.shadow);
	// Undefined store values mean "use the protocol default", keeping the page
	// and om URLs free of redundant parameters.
	const opacityPercent = $derived(
		Math.round(($sunShadow.opacity ?? DEFAULT_SUN_SHADOW_OPACITY) * 100)
	);
	const gradient = $derived($sunShadow.gradient ?? DEFAULT_SUN_SHADOW_GRADIENT);
	const colorHex = $derived('#' + ($sunShadow.color ?? defaultColorHex));

	const setOpacity = (percent: number) => {
		const opacity = percent / 100;
		$sunShadow.opacity = opacity === DEFAULT_SUN_SHADOW_OPACITY ? undefined : opacity;
		updateUrl('sun_opacity', String(opacity), String(DEFAULT_SUN_SHADOW_OPACITY));
		updateSunLayer();
	};

	const setGradient = (degrees: number) => {
		$sunShadow.gradient = degrees === DEFAULT_SUN_SHADOW_GRADIENT ? undefined : degrees;
		updateUrl('sun_gradient', String(degrees), String(DEFAULT_SUN_SHADOW_GRADIENT));
		updateSunLayer();
	};

	const setColor = (hexWithHash: string) => {
		const hex = hexWithHash.replace('#', '').toLowerCase();
		$sunShadow.color = hex === defaultColorHex ? undefined : hex;
		updateUrl('sun_color', hex, defaultColorHex);
		updateSunLayer();
	};
</script>

<div>
	<h2 class="text-lg font-bold">Sun Shadow</h2>
	<div class="mt-3 flex gap-3">
		<Switch
			id="sun-shadow"
			class="cursor-pointer"
			bind:checked={$sunShadow.shadow}
			onCheckedChange={() => {
				updateUrl('sun_shadow', String(shadow), 'false');
				updateSunLayer();
			}}
		/>
		<Label class="cursor-pointer" for="sun-shadow">Sun shadow {shadow ? 'on' : 'off'}</Label>
	</div>
	<div class="mt-3 flex gap-3 duration-300 {shadow ? '' : 'opacity-50'}">
		<input
			disabled={!shadow}
			id="sun-opacity-slider"
			class="w-25 delay-75 duration-200"
			type="range"
			min="0"
			max="100"
			value={opacityPercent}
			onchange={(e) => setOpacity(Number(e.currentTarget.value))}
		/>
		<Label for="sun-opacity-slider">Opacity: {opacityPercent}%</Label>
	</div>
	<div class="mt-3 flex gap-3 duration-300 {shadow ? '' : 'opacity-50'}">
		<input
			disabled={!shadow}
			id="sun-gradient-slider"
			class="w-25 delay-75 duration-200"
			type="range"
			min="0"
			max="18"
			value={gradient}
			onchange={(e) => setGradient(Number(e.currentTarget.value))}
		/>
		<Label for="sun-gradient-slider">Twilight gradient: {gradient}°</Label>
	</div>
	<div class="mt-3 flex gap-3 duration-300 {shadow ? '' : 'opacity-50'}">
		<input
			disabled={!shadow}
			id="sun-color"
			class="h-6 w-10 cursor-pointer"
			type="color"
			value={colorHex}
			onchange={(e) => setColor(e.currentTarget.value)}
		/>
		<Label for="sun-color">Shadow color</Label>
	</div>
</div>
