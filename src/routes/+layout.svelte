<script lang="ts">
	import { ModeWatcher } from 'mode-watcher';

	import { Toaster } from '$lib/components/ui/sonner';

	let { children } = $props();
</script>

<Toaster
	closeButton={true}
	richColors={true}
	offset={false ? { bottom: '130px', right: '10px' } : { bottom: '10px', right: '10px' }}
/>

{@render children()}
<ModeWatcher />
