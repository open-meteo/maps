<script lang="ts">
	import { ModeWatcher } from 'mode-watcher';

	import { Toaster } from '$lib/components/ui/sonner';

	let { children } = $props();
</script>

<!-- make reactive to time-selector, was causing troubles before offset={flag ? { bottom: '130px', right: '10px' } : { bottom: '10px', right: '10px' }}-->
<Toaster closeButton={true} richColors={true} offset={{ bottom: '10px', right: '10px' }} />

{@render children()}
<ModeWatcher />
