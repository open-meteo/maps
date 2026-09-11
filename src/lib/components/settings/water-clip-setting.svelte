<script lang="ts">
	import { defaultPreferences, preferences } from '$lib/stores/preferences';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { reloadStyles } from '$lib/map-controls';
	import { updateUrl } from '$lib/url';

	import SettingsSection from './settings-section.svelte';

	const clipWater = $derived($preferences.clipWater);
</script>

<SettingsSection title="Clip Water">
	<div class="mt-3 flex gap-3 cursor-pointer">
		<Switch
			id="arrows"
			bind:checked={$preferences.clipWater}
			onCheckedChange={() => {
				updateUrl('clip_water', String(clipWater), String(defaultPreferences.clipWater)); // different key,

				reloadStyles();
			}}
		/>
		<Label for="arrows">Clip Water {clipWater ? 'on' : 'off'}</Label>
	</div>
</SettingsSection>
