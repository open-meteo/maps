<script lang="ts">
	import { isSeamlessDomain } from '@openmeteo/weather-map-layer';

	import { preferences } from '$lib/stores/preferences';
	import { selectedDomain } from '$lib/stores/variables';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { updateSeamlessBorderLayer } from '$lib/layers';

	// Only a seamless domain has sub-domain borders to draw
	const isSeamless = $derived(isSeamlessDomain($selectedDomain));
	const showBorders = $derived($preferences.showSeamlessBorders);
</script>

{#if isSeamless}
	<div>
		<h2 class="text-lg font-bold">Seamless Borders</h2>
		<div class="mt-3 flex gap-3 cursor-pointer">
			<Switch
				id="seamless-borders"
				bind:checked={$preferences.showSeamlessBorders}
				onCheckedChange={() => {
					updateSeamlessBorderLayer();
				}}
			/>
			<Label for="seamless-borders" class="cursor-pointer">
				Domain borders {showBorders ? 'on' : 'off'}
			</Label>
		</div>
	</div>
{/if}
