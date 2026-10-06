<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { vectorOptions } from '#lib/stores/vector.js';

	import { Label } from '#lib/components/ui/label/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';

	import { changeOMfileURL } from '#lib/layers.js';
	import { updateUrl } from '#lib/url.js';

	import SettingsSection from './settings-section.svelte';

	let grid = $derived($vectorOptions.grid);
</script>

<SettingsSection title="Grid settings">
	<div class="mt-3 flex gap-3">
		<Switch
			id="grid"
			class="cursor-pointer"
			bind:checked={$vectorOptions.grid}
			onCheckedChange={() => {
				updateUrl('grid', String(grid));

				changeOMfileURL();
				toast.info('Grid turned ' + (grid ? 'on' : 'off'));
			}}
		/>
		<Label for="grid" class="cursor-pointer">Gridpoints {grid ? 'on' : 'off'}</Label>
	</div>
</SettingsSection>
