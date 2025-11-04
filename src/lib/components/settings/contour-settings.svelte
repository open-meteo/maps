<script lang="ts">
	import { get } from 'svelte/store';

	import { toast } from 'svelte-sonner';

	import { pushState } from '$app/navigation';

	import { contourInterval as cI, preferences as p } from '$lib/stores/preferences';

	import { Input } from '$lib/components/ui/input';
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
	let contours = $derived(preferences.contours);
	let contourInterval = $derived(get(cI));
</script>

<div class="mt-6">
	<h2 class="text-lg font-bold">Contour settings</h2>
	<div class="mt-3 flex gap-3">
		<Switch
			id="contouring"
			checked={contours}
			onCheckedChange={() => {
				preferences.contours = !preferences.contours;
				p.set(preferences);

				preferences = get(p);
				contours = preferences.contours;
				if (preferences.contours) {
					url.searchParams.set('contours', String(true));
					addVectorLayer(map);
				} else {
					url.searchParams.delete('contours');
					removeVectorLayer(map);
				}
				pushState(url + map._hash.getHashString(), {});
				toast.info(preferences.contours ? 'Contours switched on' : 'Contours switched off');
				changeOMfileURL(map, url);
			}}
		/>
		<Label for="contouring">Contouring {preferences.contours ? 'on' : 'off'}</Label>
	</div>
	<div class="mt-3 flex gap-3">
		<input
			id="interval_slider"
			class="w-[100px] delay-75 duration-200"
			type="range"
			min="0"
			max="20"
			bind:value={contourInterval}
			oninput={(e) => {
				const target = e.target as HTMLInputElement;
				const value = target?.value;
				cI.set(Number(value));
				changeOMfileURL(map, url);
				if (get(cI) !== 2 && preferences.contours) {
					url.searchParams.set('interval', String(get(cI)));
				} else {
					url.searchParams.delete('interval');
				}
				pushState(url + map._hash.getHashString(), {});
				if (preferences.contours) {
					changeOMfileURL(map, url);
				}
			}}
		/>
		<Label for="interval">Contouring interval:</Label><Input
			id="interval"
			class="w-20"
			step="0.5"
			oninput={(e) => {
				const target = e.target as HTMLInputElement;
				const value = target?.value;
				cI.set(Number(value));
				changeOMfileURL(map, url);
				if (get(cI) !== 2 && preferences.contours) {
					url.searchParams.set('interval', String(get(cI)));
				} else {
					url.searchParams.delete('interval');
				}
				pushState(url + map._hash.getHashString(), {});
				if (preferences.contours) {
					changeOMfileURL(map, url);
				}
			}}
			bind:value={contourInterval}
		/>
	</div>
</div>
