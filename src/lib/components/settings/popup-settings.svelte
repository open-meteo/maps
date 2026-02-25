<script lang="ts">
	import { get } from 'svelte/store';

	import { toast } from 'svelte-sonner';

	import { map, popup, popupMode } from '$lib/stores/map';
	import { desktop } from '$lib/stores/preferences';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { renderPopup } from '$lib/popup';

	let popupOn = $state(!!$popupMode);
	let popupModeFollow = $state($popupMode === 'follow');
</script>

<div>
	<h2 class="text-lg font-bold">Popup settings</h2>
	<div class="mt-3 flex gap-3">
		<Switch
			id="popup_mode"
			class="cursor-pointer"
			bind:checked={popupOn}
			onCheckedChange={() => {
				const p = get(popup);
				let lastLngLat;
				if (p) {
					lastLngLat = p.getLngLat();
				}

				if (get(popupMode) === null) {
					if (desktop.current) {
						popupMode.set('follow');
					} else {
						popupMode.set('drag');
					}
				} else if (get(popupMode) === 'follow') {
					popupMode.set('drag');
					return;
				}
				popupModeFollow = $popupMode === 'follow';
				toast.info('Popup: ' + (popupOn ? 'on' : 'off'));

				renderPopup(lastLngLat ?? $map.getCenter());
			}}
		/>
		<Label class="cursor-pointer" for="popup_mode">Popup</Label>
	</div>
	<div class="mt-3 flex gap-3">
		<Switch
			id="popup_mode"
			class="cursor-pointer"
			disabled={!desktop.current}
			bind:checked={popupModeFollow}
			onCheckedChange={() => {
				if ($popupMode === 'drag') {
					popupMode.set('follow');
				} else if ($popupMode === 'follow') {
					popupMode.set('drag');
				}
				popupModeFollow = $popupMode === 'follow';
				toast.info(
					'Popup mode: ' +
						($popupMode ? ($popupMode === 'follow' ? 'follows mouse' : 'draggable') : 'off')
				);
			}}
		/>
		<Label class="cursor-pointer" for="popup_mode"
			>Popup mode: {$popupMode === 'follow' ? 'follows mouse' : 'draggable'}</Label
		>
	</div>
</div>
