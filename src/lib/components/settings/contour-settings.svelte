<script lang="ts">
	import { get } from 'svelte/store';

	import { toast } from 'svelte-sonner';

	import { defaultVectorOptions, vectorOptions as vO } from '$lib/stores/vector';

	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { changeOMfileURL, updateUrl } from '$lib';

	let vectorOptions = $state(get(vO));
	vO.subscribe((newVectorOptions) => {
		vectorOptions = newVectorOptions;
	});

	let contours = $derived(vectorOptions.contours);
	let breakpoints = $derived(vectorOptions.breakpoints);
	let contourInterval = $derived(vectorOptions.contourInterval);

	const handleContourIntervalChange = (event: Event) => {
		const target = event.target as HTMLInputElement;
		const value = target?.value;

		vectorOptions.contourInterval = Number(value);
		vO.set(vectorOptions);

		updateUrl('contour_interval', String(vectorOptions.contourInterval));

		if (vectorOptions.contours) {
			changeOMfileURL(false, false, true);
		}
	};
</script>

<div>
	<h2 class="text-lg font-bold">Contour settings</h2>
	<div class="mt-3 flex gap-3 cursor-pointer">
		<Switch
			id="contouring"
			checked={contours}
			onCheckedChange={() => {
				vectorOptions.contours = !vectorOptions.contours;
				vO.set(vectorOptions);

				updateUrl('contours', String(contours));

				changeOMfileURL();
				toast.info('Contours turned ' + contours ? 'on' : 'off');
			}}
		/>
		<Label for="contouring">Contouring {contours ? 'on' : 'off'}</Label>
	</div>
	<div class="mt-3 flex gap-3 cursor-pointer">
		<Switch
			id="contouring"
			checked={breakpoints}
			onCheckedChange={() => {
				vectorOptions.breakpoints = !vectorOptions.breakpoints;
				vO.set(vectorOptions);

				updateUrl(
					'interval_on_breakpoints',
					String(breakpoints),
					String(defaultVectorOptions.breakpoints) // key is different
				);

				changeOMfileURL();

				toast.info('Contour interval on colorscale turned ' + breakpoints ? 'on' : 'off');
			}}
		/>
		<Label for="contouring">Interval on breakpoints {breakpoints ? 'on' : 'off'}</Label>
	</div>
	<div class="mt-3 flex gap-3 duration-300 {breakpoints ? 'opacity-50' : ''}">
		<input
			disabled={breakpoints}
			id="interval_slider"
			class="w-[100px] delay-75 duration-200"
			type="range"
			min="0"
			max="200"
			bind:value={contourInterval}
			oninput={handleContourIntervalChange}
		/>
		<Label for="interval">Contouring interval:</Label><Input
			id="interval"
			class="w-20"
			step="0.5"
			bind:value={contourInterval}
			oninput={handleContourIntervalChange}
		/>
	</div>
</div>
