<script lang="ts">
	import { opacity } from '$lib/stores/preferences';

	import { Label } from '$lib/components/ui/label';

	import { reloadStyles } from '$lib';
</script>

<div>
	<h2 class="text-lg font-bold">Raster Opacity</h2>
	<div class="mt-3 flex gap-3">
		<Label for="interval">Opacity:</Label>
		<input
			id="interval_slider"
			class="w-[100px] delay-75 duration-200"
			type="range"
			min="0"
			max="100"
			onchange={reloadStyles}
			bind:value={$opacity}
		/>
		{$opacity}
	</div>
</div>
