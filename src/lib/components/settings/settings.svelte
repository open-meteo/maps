<script lang="ts">
	import ArrowsSettings from './arrows-settings.svelte';
	import ContourSettings from './contour-settings.svelte';
	import GridSettings from './grid-settings.svelte';
	import ResolutionSettings from './resolution-settings.svelte';

	import type { Map } from 'maplibre-gl';

	interface Props {
		map: Map;
		url: URL;
	}

	let { map = $bindable(), url }: Props = $props();
</script>

<GridSettings {map} {url} />
<ArrowsSettings {map} {url} />
<ContourSettings {map} {url} />
<ResolutionSettings {map} {url} />
