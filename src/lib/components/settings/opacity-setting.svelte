<script lang="ts">
	import { opacity } from '$lib/stores/preferences';

	import { Label } from '$lib/components/ui/label';

	// Opacity is part of the raster frame identity, so a re-render swaps in a
	// frame with the new opacity — no full basemap style reload needed.
	import { changeOMfileURL } from '$lib/layers';
</script>

<div>
	<h2 class="text-lg font-bold">Raster Opacity</h2>
	<div class="mt-3 flex gap-3">
		<Label for="interval">Opacity:</Label>
		<input
			id="interval_slider"
			class="w-25 delay-75 duration-200"
			type="range"
			min="0"
			max="100"
			onchange={changeOMfileURL}
			bind:value={$opacity}
		/>
		{$opacity}
	</div>
</div>
