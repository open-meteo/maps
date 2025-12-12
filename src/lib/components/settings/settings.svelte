<script lang="ts">
	import ArrowsSettings from './arrows-settings.svelte';
	import ContourSettings from './contour-settings.svelte';
	import GridSettings from './grid-settings.svelte';
	import PartialSettings from './partial-settings.svelte';
	import ResolutionSettings from './resolution-settings.svelte';
	import StateSettings from './state-settings.svelte';
	import UnitSettings from './unit-settings.svelte';
	import WaterClipSetting from './water-clip-setting.svelte';

	import type { DomainMetaData } from '@openmeteo/mapbox-layer';
	import type { Map } from 'maplibre-gl';

	interface Props {
		map: Map;
		url: URL;
		metaJson: DomainMetaData | undefined;
		onReset: () => Promise<void>;
	}

	let { map = $bindable(), url, metaJson, onReset }: Props = $props();
</script>

<div class="flex flex-col px-6 pt-12 pb-18 gap-6 min-h-full">
	<UnitSettings />
	<GridSettings {map} {url} />
	<ArrowsSettings {map} {url} />
	<ContourSettings {map} {url} />
	<ResolutionSettings {map} {url} />
	<PartialSettings {map} {url} {metaJson} />
	<WaterClipSetting {map} {url} />
	<StateSettings {onReset} />
</div>
