<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { vectorOptions } from '$lib/stores/vector';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { changeOMfileURL } from '$lib/layers';
	import { updateUrl } from '$lib/url';

	import SettingsSection from './settings-section.svelte';

	let arrows = $derived($vectorOptions.arrows);
</script>

<SettingsSection title="Arrows settings">
	<div class="mt-3 flex gap-3">
		<Switch
			id="arrows"
			class="cursor-pointer"
			bind:checked={$vectorOptions.arrows}
			onCheckedChange={() => {
				updateUrl('arrows', String(arrows));
				changeOMfileURL();
				toast.info('Arrows turned ' + (arrows ? 'on' : 'off'));
			}}
		/>
		<Label class="cursor-pointer" for="arrows">Arrows {arrows ? 'on' : 'off'}</Label>
	</div>
</SettingsSection>
