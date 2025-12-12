<script lang="ts">
	import { get } from 'svelte/store';

	import { toast } from 'svelte-sonner';

	import { pushState } from '$app/navigation';

	import { vectorOptions as vO } from '$lib/stores/vector';

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

	let vectorOptions = $state(get(vO));
	vO.subscribe((newVectorOptions) => {
		vectorOptions = newVectorOptions;
	});
	let contours = $derived(vectorOptions.contours);
	let breakpoints = $derived(vectorOptions.breakpoints);
	let contourInterval = $derived(vectorOptions.contourInterval);

	const handleContourIntervalChange = (event: Event) => {
		const target = event.target as HTMLInputElement;
		const value = target?.value;
		vectorOptions.contourInterval = Number(value);
		if (vectorOptions.contourInterval !== 2 && contours) {
			url.searchParams.set('interval', String(vectorOptions.contourInterval));
		} else {
			url.searchParams.delete('interval');
		}
		pushState(url + map._hash.getHashString(), {});
		if (vectorOptions.contours) {
			changeOMfileURL(map, url, undefined, false, true);
		}
	};
</script>

<div>
	<h2 class="text-lg font-bold">Contour settings</h2>
	<div class="mt-3 flex gap-3 cursor-pointer">
		<Switch
			id="contouring"
			checked={contours}
			onCheckedChange={() => {
				vectorOptions.contours = !vectorOptions.contours;
				vO.set(vectorOptions);
				if (vectorOptions.contours) {
					url.searchParams.set('contours', 'true');
					addVectorLayer(map);
				} else {
					url.searchParams.delete('contours');
					removeVectorLayer(map);
				}
				pushState(url + map._hash.getHashString(), {});
				toast.info(vectorOptions.contours ? 'Contours turned on' : 'Contours turned off');
				changeOMfileURL(map, url);
			}}
		/>
		<Label for="contouring">Contouring {vectorOptions.contours ? 'on' : 'off'}</Label>
	</div>
	<div class="mt-3 flex gap-3 cursor-pointer">
		<Switch
			id="contouring"
			checked={breakpoints}
			onCheckedChange={() => {
				vectorOptions.breakpoints = !vectorOptions.breakpoints;
				vO.set(vectorOptions);
				if (vectorOptions.breakpoints) {
					url.searchParams.set('interval_on_breakpoints', 'true');
					addVectorLayer(map);
				} else {
					url.searchParams.delete('interval_on_breakpoints');
					removeVectorLayer(map);
				}
				toast.info(
					vectorOptions.breakpoints
						? 'Contour interval on breakpoints turned on'
						: 'Contour interval on breakpoints turned off'
				);
				changeOMfileURL(map, url);
			}}
		/>
		<Label for="contouring"
			>Interval on breakpoints {vectorOptions.breakpoints ? 'on' : 'off'}</Label
		>
	</div>
	<div class="mt-3 flex gap-3 duration-300 {vectorOptions.breakpoints ? 'opacity-50' : ''}">
		<input
			disabled={vectorOptions.breakpoints}
			id="interval_slider"
			class="w-[100px] delay-75 duration-200"
			type="range"
			min="0"
			max="200"
			bind:value={contourInterval}
			oninput={handleContourIntervalChange}
		/>
		<Label for="interval">Contouring interval:</Label><Input
			id="interval"
			class="w-20"
			step="0.5"
			bind:value={contourInterval}
			oninput={handleContourIntervalChange}
		/>
	</div>
</div>
