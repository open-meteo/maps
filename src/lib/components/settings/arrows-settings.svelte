<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { setArrowsOnActiveChart } from '$lib/stores/chart';
	import { vectorOptions } from '$lib/stores/vector';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { changeOMfileURL } from '$lib/layers';
	import { updateUrl } from '$lib/url';

	let arrows = $derived($vectorOptions.arrows);
</script>

<div>
	<h2 class="text-lg font-bold">Arrows settings</h2>
	<div class="mt-3 flex gap-3">
		<Switch
			id="arrows"
			class="cursor-pointer"
			bind:checked={$vectorOptions.arrows}
			onCheckedChange={() => {
				updateUrl('arrows', String(arrows));
				// Applies to every capable source, also on presets/saved charts
				setArrowsOnActiveChart(arrows);
				changeOMfileURL();
				toast.info('Arrows turned ' + (arrows ? 'on' : 'off'));
			}}
		/>
		<Label class="cursor-pointer" for="arrows">Arrows {arrows ? 'on' : 'off'}</Label>
	</div>
</div>
