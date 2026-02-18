<script lang="ts">
	import { get } from 'svelte/store';

	import { map } from '$lib/stores/map';
	import { tileSize as tS, tileSizeSource as tSS } from '$lib/stores/preferences';

	import Button from '$lib/components/ui/button/button.svelte';

	import { changeOMfileURL } from '$lib';

	const handleTileSourceSizeChange = (tile: 128 | 256 | 512) => {
		tSS.set(tile);
	};

	const handleTileSizeChange = (tile: 64 | 128 | 256 | 512 | 1024 | 2048) => {
		tS.set(tile);
		changeOMfileURL();
	};

	let tileSizeSource = $state(get(tSS));
	tSS.subscribe((newTileSizeSource) => {
		tileSizeSource = newTileSizeSource;
	});

	let tileSize = $state(get(tS));
	tS.subscribe((newTileSize) => {
		tileSize = newTileSize;
	});
</script>

<div>
	<h2 class="text-lg font-bold">Tile Size Source</h2>
	<div class="mt-3 flex gap-3">
		<Button
			class="min-w-16 cursor-pointer {tileSizeSource === 128 ? 'bg-primary' : 'bg-primary/75'}"
			onclick={() => handleTileSourceSizeChange(128)}>128</Button
		>
		<Button
			class="min-w-16 cursor-pointer {tileSizeSource === 256 ? 'bg-primary' : 'bg-primary/75'}"
			onclick={() => handleTileSourceSizeChange(256)}>256</Button
		>
		<Button
			class="min-w-16 cursor-pointer {tileSizeSource === 512 ? 'bg-primary' : 'bg-primary/75'}"
			onclick={() => handleTileSourceSizeChange(512)}>512 (Default)</Button
		>
	</div>
</div>
<div>
	<h2 class="text-lg font-bold">Tile Size Data</h2>
	<div class="mt-3 flex gap-3 flex-wrap">
		<Button
			class="min-w-16 cursor-pointer {tileSize === 64 ? 'bg-primary' : 'bg-primary/75'}"
			onclick={() => handleTileSizeChange(64)}>64</Button
		>
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
		<Button
			class="min-w-16 cursor-pointer {tileSize === 1024 ? 'bg-primary' : 'bg-primary/75'}"
			onclick={() => handleTileSizeChange(1024)}>1024</Button
		>
		<Button
			class="min-w-16 cursor-pointer {tileSize === 2048 ? 'bg-primary' : 'bg-primary/75'}"
			onclick={() => handleTileSizeChange(2048)}>2048</Button
		>
	</div>
</div>
