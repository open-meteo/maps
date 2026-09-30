<script lang="ts">
	import { isGpuSupported } from '@openmeteo/weather-map-layer';

	import { DEFAULT_RENDERER, type Renderer, renderer } from '$lib/stores/preferences';

	import Button from '$lib/components/ui/button/button.svelte';

	import { changeOMfileURL } from '$lib/layers';
	import { updateUrl } from '$lib/url';

	import SettingsSection from './settings-section.svelte';

	// Probed once: WebGL2 support does not change while the page is open
	const gpuSupported = isGpuSupported();

	const setRenderer = (value: Renderer) => {
		if (value === $renderer) return;
		renderer.set(value);
		updateUrl('renderer', value, DEFAULT_RENDERER);
		changeOMfileURL();
	};
</script>

<SettingsSection title="Rendering">
	<div class="mt-3 flex gap-3">
		<Button
			class="min-w-16 cursor-pointer {$renderer === 'cpu' ? 'bg-primary' : 'bg-primary/75'}"
			onclick={() => setRenderer('cpu')}>CPU</Button
		>
		<Button
			class="min-w-16 cursor-pointer {$renderer === 'gpu' ? 'bg-primary' : 'bg-primary/75'}"
			disabled={!gpuSupported}
			onclick={() => setRenderer('gpu')}>GPU</Button
		>
	</div>
	<p class="mt-2 text-xs opacity-75">
		{#if !gpuSupported}
			GPU rendering needs WebGL2, which this browser does not provide.
		{:else if $renderer === 'gpu'}
			Rasters of regular lat/lon grids render as GPU layers (experimental); other rasters, contours,
			arrows and grid points still come from CPU tiles.
		{:else}
			Everything renders as tiles on the CPU pipeline.
		{/if}
	</p>
</SettingsSection>
