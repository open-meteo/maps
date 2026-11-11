<script lang="ts">
	import { detectGpuSupport } from '@openmeteo/weather-map-layer';

	import { gpuRenderOptions } from '#lib/stores/gpu-render.js';
	import { activeRenderer } from '#lib/stores/preferences.js';

	import { Label } from '#lib/components/ui/label/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';

	import { changeOMfileURL } from '#lib/layers.js';

	import SettingsSection from './settings-section.svelte';

	// The rain streaks are a particle pass, which needs float render targets.
	const particlesSupported = detectGpuSupport().particles;
</script>

<SettingsSection
	title="GPU rendering"
	disabled={$activeRenderer === 'cpu'}
	note="Only with GPU rendering."
>
	<div class="mt-3 flex gap-3">
		<Switch
			id="temporal-blend"
			class="cursor-pointer"
			bind:checked={$gpuRenderOptions.temporalBlend}
		/>
		<Label for="temporal-blend" class="cursor-pointer">
			Temporal animation (off = snap when loaded)
		</Label>
	</div>
	<div class="mt-3 flex gap-3">
		<Switch
			id="advected-blend"
			class="cursor-pointer"
			bind:checked={$gpuRenderOptions.advectedBlend}
			onCheckedChange={changeOMfileURL}
		/>
		<Label for="advected-blend" class="cursor-pointer">
			Wind-advected blend (precipitation and clouds drift with the flow)
		</Label>
	</div>
	<div class="mt-3 flex gap-3">
		<Switch
			id="rain-animation"
			class="cursor-pointer"
			bind:checked={$gpuRenderOptions.rainAnimation}
			disabled={!particlesSupported}
			onCheckedChange={changeOMfileURL}
		/>
		<Label for="rain-animation" class="cursor-pointer">
			Rain animation (falling streaks over precipitation)
		</Label>
	</div>
</SettingsSection>
