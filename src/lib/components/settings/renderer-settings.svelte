<script lang="ts">
	import { isGpuSupported } from '@openmeteo/weather-map-layer';

	import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
	import { DEFAULT_RENDERER, type Renderer, renderer } from '$lib/stores/preferences';

	import Button from '$lib/components/ui/button/button.svelte';

	import { changeOMfileURL } from '$lib/layers';
	import { updateUrl } from '$lib/url';

	import SettingsSection from './settings-section.svelte';

	const supported = isGpuSupported();

	const setRenderer = (value: Renderer) => {
		if (value === $renderer) return;
		renderer.set(value);
		updateUrl('renderer', value, DEFAULT_RENDERER);
		omProtocolSettings.update((settings) => ({ ...settings, gpu: value === 'gpu' }));
		changeOMfileURL();
	};
</script>

<SettingsSection title="Rendering">
	<div class="mt-3 flex gap-3">
		<Button
			class="min-w-16 cursor-pointer {$renderer === 'gpu' ? 'bg-primary' : 'bg-primary/75'}"
			disabled={!supported}
			onclick={() => setRenderer('gpu')}>GPU</Button
		>
		<Button
			class="min-w-16 cursor-pointer {$renderer === 'cpu' ? 'bg-primary' : 'bg-primary/75'}"
			onclick={() => setRenderer('cpu')}>CPU</Button
		>
	</div>
	<p class="mt-2 text-xs opacity-75">
		{#if !supported}
			WebGL2 is not available in this browser; everything renders as tiles on the CPU pipeline.
		{:else if $renderer === 'gpu'}
			Raster tiles are rasterised by a WebGL2 shader in the tile worker; arrows, contour lines, grid
			points and polygon clipping still come from CPU tiles.
		{:else}
			Everything renders as tiles on the CPU pipeline.
		{/if}
	</p>
</SettingsSection>
