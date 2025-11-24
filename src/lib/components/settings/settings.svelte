<script lang="ts">
	import ArrowsSetting from './arrows-setting.svelte';
	import ContourSettings from './contour-settings.svelte';
	import ResolutionSettings from './resolution-settings.svelte';

	import type { Map } from 'maplibre-gl';

	interface Props {
		map: Map;
		url: URL;
	}

	let { map = $bindable(), url }: Props = $props();
</script>

<ArrowsSetting {map} {url} />
<ContourSettings {map} {url} />
<ResolutionSettings {map} {url} />
