<script lang="ts">
	import { map, paddedBoundsLayer, paddedBoundsSource } from '$lib/stores/map';
	import { defaultPreferences, preferences } from '$lib/stores/preferences';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { changeOMfileURL, getPaddedBounds, updateUrl } from '$lib';

	let partial = $derived($preferences.partial);
</script>

<div>
	<h2 class="text-lg font-bold">Partial Requests</h2>
	<div class="mt-3 flex gap-3">
		<Switch
			id="arrows"
			class="cursor-pointer"
			bind:checked={$preferences.partial}
			onCheckedChange={() => {
				updateUrl('partial', String(partial), String(defaultPreferences.partial));

				if (partial) {
					getPaddedBounds();
				} else {
					$map.removeLayer('paddedBoundsLayer');
					$map.removeSource('paddedBoundsSource');
					paddedBoundsLayer.set(undefined);
					paddedBoundsSource.set(undefined);
				}

				changeOMfileURL();
			}}
		/>
		<Label class="cursor-pointer" for="arrows">Partials {partial ? 'on' : 'off'}</Label>
	</div>
</div>
