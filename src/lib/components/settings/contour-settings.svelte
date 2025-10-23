<script lang="ts">
	import { get } from 'svelte/store';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { preferences as p, contourInterval as cI } from '$lib/stores/preferences';
	import { changeOMfileURL } from '$lib';

	import type { Map } from 'maplibre-gl';

	interface Props {
		map: Map;
		url: URL;
	}

	let { map = $bindable(), url }: Props = $props();

	const preferences = get(p);
	let contourInterval = $derived(get(cI));
</script>

<div class="mt-6">
	<h2 class="text-lg font-bold">Contour settings</h2>
	<div class="mt-3 flex gap-3">
		<Switch id="contouring" bind:checked={preferences.contours} onCheckedChange={() => {}} />
		<Label for="contouring">Contouring {preferences.contours ? 'on' : 'off'}</Label>
	</div>
	<div class="mt-3 flex gap-3">
		<input
			id="interval_slider"
			class="w-[100px] delay-75 duration-200"
			type="range"
			min="1"
			max="20"
			bind:value={contourInterval}
			oninput={(e) => {
				const target = e.target as HTMLInputElement;
				const value = target?.value;
				cI.set(Number(value));
				changeOMfileURL(map, url);
			}}
		/>
		Contouring interval: {contourInterval}
	</div>
</div>
