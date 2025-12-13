<script lang="ts">
	import ArrowsSettings from './arrows-settings.svelte';
	import ContourSettings from './contour-settings.svelte';
	import GridSettings from './grid-settings.svelte';
	import OpacitySetting from './opacity-setting.svelte';
	import PartialSettings from './partial-settings.svelte';
	import ResolutionSettings from './resolution-settings.svelte';
	import StateSettings from './state-settings.svelte';
	import UnitSettings from './unit-settings.svelte';
	import WaterClipSetting from './water-clip-setting.svelte';

	interface Props {
		onReset: () => Promise<void>;
	}

	let { onReset }: Props = $props();
</script>

<div class="flex flex-col px-6 pt-12 pb-18 gap-6 min-h-full">
	<UnitSettings />
	<GridSettings />
	<ArrowsSettings />
	<ContourSettings />
	<ResolutionSettings />
	<PartialSettings />
	<WaterClipSetting />
	<OpacitySetting />
	<StateSettings {onReset} />
</div>
