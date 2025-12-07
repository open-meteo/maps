<script lang="ts">
	import Button from '../ui/button/button.svelte';
	import ArrowsSettings from './arrows-settings.svelte';
	import ContourSettings from './contour-settings.svelte';
	import GridSettings from './grid-settings.svelte';
	import ResolutionSettings from './resolution-settings.svelte';

	import type { Map } from 'maplibre-gl';

	interface Props {
		map: Map;
		url: URL;
		onReset: () => Promise<void>;
	}

	let { map = $bindable(), url, onReset }: Props = $props();
</script>

<GridSettings {map} {url} />
<ArrowsSettings {map} {url} />
<ContourSettings {map} {url} />
<ResolutionSettings {map} {url} />
<div class="mt-6">
	<h2 class="text-lg font-bold">States</h2>
	<Button onclick={onReset}>Reset all states</Button>
</div>
