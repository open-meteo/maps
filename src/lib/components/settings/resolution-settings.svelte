<script lang="ts">
	import { get } from 'svelte/store';

	import { resolution as r, tileSize as tS } from '$lib/stores/preferences';

	import { changeOMfileURL } from '$lib';

	import Button from '../ui/button/button.svelte';

	import type { Map } from 'maplibre-gl';

	interface Props {
		map: Map;
		url: URL;
	}

	let { map = $bindable(), url }: Props = $props();

	const handleResolutionChange = (res: 0.5 | 1 | 2) => {
		r.set(res);
		changeOMfileURL(map, url);
	};

	const handleTileSizeChange = (tile: 128 | 256 | 512) => {
		tS.set(tile);
		changeOMfileURL(map, url);
	};

	let resolution = $state(get(r));
	r.subscribe((newResolution) => {
		resolution = newResolution;
	});

	let tileSize = $state(get(tS));
	tS.subscribe((newTileSize) => {
		tileSize = newTileSize;
	});
</script>

<div class="mt-6">
	<h2 class="text-lg font-bold">Resolution settings</h2>
	<div class="mt-3 flex gap-3">
		<Button
			class="min-w-16 cursor-pointer {resolution === 0.5 ? 'bg-primary' : 'bg-primary/75'}"
			onclick={() => handleResolutionChange(0.5)}>0.5</Button
		>
		<Button
			class="min-w-16 cursor-pointer {resolution === 1 ? 'bg-primary' : 'bg-primary/75'}"
			onclick={() => handleResolutionChange(1)}>1</Button
		>
		<Button
			class="min-w-16 cursor-pointer {resolution === 2 ? 'bg-primary' : 'bg-primary/75'}"
			onclick={() => handleResolutionChange(2)}>2</Button
		>
	</div>
</div>
<div class="mt-6">
	<h2 class="text-lg font-bold">Tile Size</h2>
	<div class="mt-3 flex gap-3">
		<Button
			class="min-w-16 cursor-pointer {tileSize === 128 ? 'bg-primary' : 'bg-primary/75'}"
			onclick={() => handleTileSizeChange(128)}>128</Button
		>
		<Button
			class="min-w-16 cursor-pointer {tileSize === 256 ? 'bg-primary' : 'bg-primary/75'}"
			onclick={() => handleTileSizeChange(256)}>256</Button
		>
		<Button
			class="min-w-16 cursor-pointer {tileSize === 512 ? 'bg-primary' : 'bg-primary/75'}"
			onclick={() => handleTileSizeChange(512)}>512</Button
		>
	</div>
</div>
