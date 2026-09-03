<script lang="ts">
	import { gpuRenderOptions } from '$lib/stores/gpu-render';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import SettingsSection from './settings-section.svelte';
</script>

<SettingsSection title="GPU rendering">
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
</SettingsSection>
