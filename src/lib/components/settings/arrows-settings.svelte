<script lang="ts">
	import { get } from 'svelte/store';

	import { toast } from 'svelte-sonner';

	import { pushState } from '$app/navigation';

	import { vectorOptions as vO } from '$lib/stores/preferences';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { addVectorLayer, changeOMfileURL, removeVectorLayer } from '$lib';

	import type { Map } from 'maplibre-gl';

	interface Props {
		map: Map;
		url: URL;
	}

	let { map = $bindable(), url }: Props = $props();

	let vectorOptions = $state(get(vO));
	vO.subscribe((newVectorOptions) => {
		vectorOptions = newVectorOptions;
	});
	let arrows = $derived(vectorOptions.arrows);
</script>

<div class="mt-6">
	<h2 class="text-lg font-bold">Arrows settings</h2>
	<div class="mt-3 flex gap-3 cursor-pointer">
		<Switch
			id="arrows"
			checked={arrows}
			onCheckedChange={() => {
				vectorOptions.arrows = !vectorOptions.arrows;
				vO.set(vectorOptions);

				vectorOptions = get(vO);
				arrows = vectorOptions.arrows;
				if (!vectorOptions.arrows) {
					url.searchParams.set('arrows', 'false');
					removeVectorLayer(map);
				} else {
					url.searchParams.delete('arrows');
					addVectorLayer(map);
				}
				pushState(url + map._hash.getHashString(), {});
				toast.info(vectorOptions.arrows ? 'Arrows turned on' : 'Arrows turned off');
				changeOMfileURL(map, url);
			}}
		/>
		<Label for="arrows">Arrows {vectorOptions.arrows ? 'on' : 'off'}</Label>
	</div>
</div>
