<script lang="ts">
	import { pushState } from '$app/navigation';

	import { map } from '$lib/stores/map';
	import { preferences, url } from '$lib/stores/preferences';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { addHillshadeLayer, addHillshadeSources, addOmFileLayers, getStyle } from '$lib';

	const clipWater = $derived($preferences.clipWater);
</script>

<div>
	<h2 class="text-lg font-bold">Clip Water</h2>
	<div class="mt-3 flex gap-3 cursor-pointer">
		<Switch
			id="arrows"
			checked={clipWater}
			onCheckedChange={() => {
				$preferences.clipWater = !$preferences.clipWater;

				if (clipWater) {
					$url.searchParams.set('clip_water', String(clipWater));
				} else {
					$url.searchParams.delete('clip_water');
				}
				pushState($url + $map._hash.getHashString(), {});
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
