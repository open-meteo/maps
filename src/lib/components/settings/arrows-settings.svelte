<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { vectorOptions } from '$lib/stores/vector';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { changeOMfileURL, updateUrl } from '$lib';

	let arrows = $derived($vectorOptions.arrows);
</script>

<div>
	<h2 class="text-lg font-bold">Arrows settings</h2>
	<div class="mt-3 flex gap-3">
		<Switch
			id="arrows"
			class="cursor-pointer"
			checked={arrows}
			onCheckedChange={() => {
				$vectorOptions.arrows = !$vectorOptions.arrows;
				updateUrl('arrows', String(arrows));
				changeOMfileURL();
				toast.info('Arrows turned ' + (arrows ? 'on' : 'off'));
			}}
		/>
		<Label class="cursor-pointer" for="arrows">Arrows {arrows ? 'on' : 'off'}</Label>
	</div>
</div>
