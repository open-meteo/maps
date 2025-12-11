<script lang="ts">
	import { ModeWatcher } from 'mode-watcher';

	import { preferences } from '$lib/stores/preferences';

	import { Toaster } from '$lib/components/ui/sonner';

	let { children } = $props();

	let timeSelectorOpen = $derived($preferences.timeSelector);
</script>

<Toaster
	closeButton={true}
	richColors={true}
	offset={timeSelectorOpen ? { bottom: '130px', right: '10px' } : { bottom: '10px', right: '10px' }}
/>

{@render children()}
<ModeWatcher />
