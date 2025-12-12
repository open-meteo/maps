<script lang="ts">
	import { pushState } from '$app/navigation';

	import { preferences as p } from '$lib/stores/preferences';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { addHillshadeLayer, addHillshadeSources, addOmFileLayers, getStyle } from '$lib';

	import type { Map } from 'maplibre-gl';

	interface Props {
		map: Map;
		url: URL;
	}

	let { map = $bindable(), url }: Props = $props();

	const preferences = $derived($p);
</script>

<div>
	<h2 class="text-lg font-bold">Clip Water</h2>
	<div class="mt-3 flex gap-3 cursor-pointer">
		<Switch
			id="arrows"
			checked={preferences.clipWater}
			onCheckedChange={() => {
				preferences.clipWater = !preferences.clipWater;
				p.set(preferences);

				if (preferences.clipWater) {
					url.searchParams.set('clip-water', String(preferences.clipWater));
				} else {
					url.searchParams.delete('clip-water');
				}
				pushState(url + map._hash.getHashString(), {});
				getStyle().then((style) => {
					map.setStyle(style);
					map.once('styledata', () => {
						setTimeout(() => {
							addOmFileLayers(map);
							addHillshadeSources(map);
							if (preferences.hillshade) {
								addHillshadeLayer(map);
							}
						}, 50);
					});
				});
			}}
		/>
		<Label for="arrows">Clip Water {preferences.clipWater ? 'on' : 'off'}</Label>
	</div>
</div>
