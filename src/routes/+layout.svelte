<script lang="ts">
	import { ModeWatcher } from 'mode-watcher';

	// import { preferences as p } from '$lib/stores/preferences';

	import { Toaster } from '$lib/components/ui/sonner';

	let { children } = $props();

	// let preferences = $state(get(p));
	// p.subscribe((newPreferences) => {
	// 	preferences = newPreferences;
	// });
</script>

<!-- make reactive to time-selector, was causing troubles before offset={flag ? { bottom: '130px', right: '10px' } : { bottom: '10px', right: '10px' }}-->
<Toaster
	closeButton={true}
	richColors={true}
	offset={true ? { bottom: '85px', right: '10px' } : { bottom: '10px', right: '10px' }}
/>

{@render children()}
<ModeWatcher />
