<script lang="ts">
	import { get } from 'svelte/store';

	import { toast } from 'svelte-sonner';

	import { vectorOptions as vO } from '$lib/stores/vector';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { changeOMfileURL, updateUrl } from '$lib';

	let vectorOptions = $state(get(vO));
	vO.subscribe((newVectorOptions) => {
		vectorOptions = newVectorOptions;
	});
	let arrows = $derived(vectorOptions.arrows);
</script>

<div>
	<h2 class="text-lg font-bold">Arrows settings</h2>
	<div class="mt-3 flex gap-3 cursor-pointer">
		<Switch
			id="arrows"
			checked={arrows}
			onCheckedChange={() => {
				vectorOptions.arrows = !vectorOptions.arrows;
				vO.set(vectorOptions);
				arrows = vectorOptions.arrows;
				updateUrl('arrows', String(arrows));
				changeOMfileURL();
				toast.info('Arrows turned ' + vectorOptions.arrows ? 'on' : 'off');
			}}
		/>
		<Label for="arrows">Arrows {vectorOptions.arrows ? 'on' : 'off'}</Label>
	</div>
</div>
