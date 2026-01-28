<script lang="ts">
	import { get } from 'svelte/store';

	import { ModeWatcher } from 'mode-watcher';

	import { preferences as p } from '$lib/stores/preferences';

	import { Toaster } from '$lib/components/ui/sonner';

	let { children } = $props();

	let preferences = $state(get(p));
	p.subscribe((newPreferences) => {
		preferences = newPreferences;
	});
</script>

<Toaster
	closeButton={true}
	richColors={true}
	offset={preferences.timeSelector
		? { bottom: '85px', right: '10px' }
		: { bottom: '10px', right: '10px' }}
	mobileOffset={preferences.timeSelector ? { bottom: '85px' } : { bottom: '10px' }}
/>

{@render children()}
<ModeWatcher />
