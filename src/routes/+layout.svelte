<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { get } from 'svelte/store';

	import { ModeWatcher } from 'mode-watcher';

	import { preferences as p } from '$lib/stores/preferences';
	import { now } from '$lib/stores/time';

	import { Toaster } from '$lib/components/ui/sonner';

	import { getInitialMetaData } from '$lib';
	import { METADATA_REFRESH_INTERVAL, MILLISECONDS_PER_MINUTE } from '$lib/constants';

	let { children } = $props();

	let preferences = $state(get(p));
	p.subscribe((newPreferences) => {
		preferences = newPreferences;
	});

	let metaDataInterval: ReturnType<typeof setInterval>;
	let updateNowInterval: ReturnType<typeof setTimeout> | undefined;
	onMount(() => {
		if (metaDataInterval) clearInterval(metaDataInterval);
		metaDataInterval = setInterval(() => {
			getInitialMetaData();
		}, METADATA_REFRESH_INTERVAL);

		if (updateNowInterval) clearInterval(updateNowInterval);
		updateNowInterval = setInterval(() => {
			$now = new Date();
		}, MILLISECONDS_PER_MINUTE);
	});

	onDestroy(() => {
		if (metaDataInterval) clearInterval(metaDataInterval);
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
