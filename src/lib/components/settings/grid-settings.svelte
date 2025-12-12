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
	let grid = $derived(vectorOptions.grid);
</script>

<div>
	<h2 class="text-lg font-bold">Grid settings</h2>
	<div class="mt-3 flex gap-3 cursor-pointer">
		<Switch
			id="grid"
			checked={grid}
			onCheckedChange={() => {
				vectorOptions.grid = !vectorOptions.grid;
				vO.set(vectorOptions);

				vectorOptions = get(vO);
				grid = vectorOptions.grid;
				if (!vectorOptions.grid) {
					url.searchParams.set('grid', 'true');
					removeVectorLayer(map);
				} else {
					url.searchParams.delete('grid');
					addVectorLayer(map);
				}
				pushState(url + map._hash.getHashString(), {});
				toast.info(vectorOptions.grid ? 'Grid turned on' : 'Grid turned off');
				changeOMfileURL(map, url);
			}}
		/>
		<Label for="grid">Gridpoints {vectorOptions.grid ? 'on' : 'off'}</Label>
	</div>
</div>
