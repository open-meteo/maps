<script lang="ts">
	import { pushState } from '$app/navigation';

	import { paddedBoundsLayer, paddedBoundsSource } from '$lib/stores/map';
	import { preferences as p } from '$lib/stores/preferences';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { changeOMfileURL, getPaddedBounds } from '$lib';

	import type { DomainMetaData } from '@openmeteo/mapbox-layer';
	import type { Map } from 'maplibre-gl';

	interface Props {
		map: Map;
		url: URL;
		metaJson: DomainMetaData | undefined;
	}

	let { map = $bindable(), url, metaJson }: Props = $props();

	const preferences = $derived($p);
</script>

<div>
	<h2 class="text-lg font-bold">Partial Requests</h2>
	<div class="mt-3 flex gap-3 cursor-pointer">
		<Switch
			id="arrows"
			checked={preferences.partial}
			onCheckedChange={() => {
				preferences.partial = !preferences.partial;
				p.set(preferences);

				if (preferences.partial) {
					url.searchParams.set('partial', String(preferences.partial));
				} else {
					url.searchParams.delete('partial');
				}
				pushState(url + map._hash.getHashString(), {});

				if (preferences.partial) {
					url.searchParams.set('partial', String(preferences.partial));
					getPaddedBounds(map);
				} else {
					url.searchParams.delete('partial');
					map.removeLayer('paddedBoundsLayer');
					map.removeSource('paddedBoundsSource');
					paddedBoundsLayer.set(undefined);
					paddedBoundsSource.set(undefined);
				}
				pushState(url + map._hash.getHashString(), {});
				changeOMfileURL(map, url, metaJson);
			}}
		/>
		<Label for="arrows">Partials {preferences.partial ? 'on' : 'off'}</Label>
	</div>
</div>
