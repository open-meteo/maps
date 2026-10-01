<script lang="ts">
	import { DEFAULT_RENDERER, type Renderer, renderer } from '$lib/stores/preferences';
	import { defaultVectorOptions, vectorOptions } from '$lib/stores/vector';

	import Button from '$lib/components/ui/button/button.svelte';

	import { changeOMfileURL } from '$lib/layers';
	import { updateUrl } from '$lib/url';

	import SettingsSection from './settings-section.svelte';

	const setRenderer = (value: Renderer) => {
		if (value === $renderer) return;
		renderer.set(value);
		updateUrl('renderer', value, DEFAULT_RENDERER);
		// The animated flow is a GPU pass: CPU tiles fall back to plain arrows,
		// so the setting follows rather than showing a style that cannot draw.
		if (value === 'cpu' && $vectorOptions.arrowStyle === 'particles') {
			$vectorOptions.arrowStyle = 'arrow';
			updateUrl('arrow_style', 'arrow', defaultVectorOptions.arrowStyle);
		}
		changeOMfileURL();
	};
</script>

<SettingsSection title="Rendering">
	<div class="mt-3 flex gap-3">
		<Button
			class="min-w-16 cursor-pointer {$renderer === 'gpu' ? 'bg-primary' : 'bg-primary/75'}"
			onclick={() => setRenderer('gpu')}>GPU</Button
		>
		<Button
			class="min-w-16 cursor-pointer {$renderer === 'cpu' ? 'bg-primary' : 'bg-primary/75'}"
			onclick={() => setRenderer('cpu')}>CPU</Button
		>
	</div>
	<p class="mt-2 text-xs opacity-75">
		{#if $renderer === 'gpu'}
			Rasters, arrows, contour lines and the animated flow render as GPU layers; contour labels,
			wind barbs and grid points still come from CPU tiles.
		{:else}
			Everything renders as tiles on the CPU pipeline.
		{/if}
	</p>
</SettingsSection>
