<script lang="ts">
	import { derived } from 'svelte/store';

	import { preferences } from '$lib/stores/preferences';
	import { selectedDomain } from '$lib/stores/variables';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { updateSeamlessBorderLayer } from '$lib/layers';

	// Only show this setting when a seamless domain is selected
	const isSeamless = derived(selectedDomain, ($d) => 'layers' in $d);
	const showBorders = $derived($preferences.showSeamlessBorders);
</script>

{#if $isSeamless}
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
