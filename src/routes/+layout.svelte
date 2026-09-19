<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	import { ModeWatcher } from 'mode-watcher';
	import { toast } from 'svelte-sonner';

	import { updated } from '$app/state';

	import { now } from '$lib/stores/time';

	import { Toaster } from '$lib/components/ui/sonner';

	import { METADATA_REFRESH_INTERVAL, MILLISECONDS_PER_MINUTE } from '$lib/constants';
	import { getInitialMetaData } from '$lib/metadata';

	let { children } = $props();

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

	// `updated` flips once the polled _app/version.json reports a newer build
	// (see svelte.config.js); it never flips back, so this fires at most once.
	$effect(() => {
		if (!updated.current) return;
		toast('Open-Meteo Maps has been updated', {
			description: 'A newer version is available.',
			duration: Infinity,
			action: { label: 'Reload', onClick: () => location.reload() }
		});
	});
</script>

<Toaster
	closeButton={true}
	richColors={true}
	offset={{ bottom: '85px', right: '10px' }}
	mobileOffset={{ bottom: '85px' }}
/>

{@render children()}
<ModeWatcher />
