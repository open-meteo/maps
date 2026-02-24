<script lang="ts">
	import { get } from 'svelte/store';

	import { tileSize as tS } from '$lib/stores/preferences';

	import Button from '$lib/components/ui/button/button.svelte';

	import { changeOMfileURL } from '$lib/layers';

	const handleTileSizeChange = (tile: 64 | 128 | 256 | 512 | 1024 | 2048) => {
		tS.set(tile);
		changeOMfileURL();
	};

	let tileSize = $state(get(tS));
	tS.subscribe((newTileSize) => {
		tileSize = newTileSize;
	});
</script>

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
