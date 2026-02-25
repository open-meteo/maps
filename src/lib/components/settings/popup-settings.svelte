<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { popupFollowMouse } from '$lib/stores/map';
	import { desktop } from '$lib/stores/preferences';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
</script>

<div>
	<h2 class="text-lg font-bold">Popup settings</h2>
	<div class="mt-3 flex gap-3">
		<Switch
			id="popup_mode"
			class="cursor-pointer"
			disabled={!desktop.current}
			bind:checked={$popupFollowMouse}
			onCheckedChange={() => {
				toast.info($popupFollowMouse ? 'Popup mode: follows mouse' : 'Popup mode: draggable');
			}}
		/>
		<Label class="cursor-pointer" for="popup_mode"
			>Popup mode: {$popupFollowMouse ? 'follows mouse' : 'draggable'}</Label
		>
	</div>
</div>
