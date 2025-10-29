<script lang="ts">
	import { get } from 'svelte/store';

	import { toast } from 'svelte-sonner';

	import { pushState } from '$app/navigation';

	import { preferences as p } from '$lib/stores/preferences';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { addVectorLayer, changeOMfileURL, removeVectorLayer } from '$lib';

	import type { Map } from 'maplibre-gl';

	interface Props {
		map: Map;
		url: URL;
	}

	let { map = $bindable(), url }: Props = $props();

	let preferences = $state(get(p));
	let arrows = $derived(preferences.arrows);
</script>

<div class="mt-6">
	<h2 class="text-lg font-bold">Arrows settings</h2>
	<div class="mt-3 flex gap-3">
		<Switch
			id="arrows"
			checked={arrows}
			onCheckedChange={() => {
				preferences.arrows = !preferences.arrows;
				p.set(preferences);

				preferences = get(p);
				arrows = preferences.arrows;
				if (!preferences.arrows) {
					url.searchParams.set('arrows', String(false));
					removeVectorLayer(map);
				} else {
					url.searchParams.delete('arrows');
					addVectorLayer(map);
				}
				pushState(url + map._hash.getHashString(), {});
				toast.info(preferences.arrows ? 'Arrows switched on' : 'Arrows switched off');
				changeOMfileURL(map, url);
			}}
		/>
		<Label for="arrows">Arrows {preferences.arrows ? 'on' : 'off'}</Label>
	</div>
</div>
