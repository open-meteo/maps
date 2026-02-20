<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { vectorOptions } from '$lib/stores/vector';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { changeOMfileURL } from '$lib/layers';
	import { updateUrl } from '$lib/url';

	let grid = $derived($vectorOptions.grid);
</script>

<div>
	<h2 class="text-lg font-bold">Grid settings</h2>
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
</div>
