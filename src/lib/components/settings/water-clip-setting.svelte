<script lang="ts">
	import { map } from '$lib/stores/map';
	import { defaultPreferences, preferences } from '$lib/stores/preferences';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import {
		addHillshadeLayer,
		addHillshadeSources,
		addOmFileLayers,
		getStyle,
		updateUrl
	} from '$lib';

	const clipWater = $derived($preferences.clipWater);
</script>

<div>
	<h2 class="text-lg font-bold">Clip Water</h2>
	<div class="mt-3 flex gap-3 cursor-pointer">
		<Switch
			id="arrows"
			bind:checked={$preferences.clipWater}
			onCheckedChange={() => {
				updateUrl('clip_water', String(clipWater), String(defaultPreferences.clipWater)); // different key,

				getStyle().then((style) => {
					$map.setStyle(style);
					$map.once('styledata', () => {
						setTimeout(() => {
							addOmFileLayers();
							addHillshadeSources();
							if ($preferences.hillshade) {
								addHillshadeLayer();
							}
						}, 50);
					});
				});
			}}
		/>
		<Label for="arrows">Clip Water {clipWater ? 'on' : 'off'}</Label>
	</div>
</div>
