<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	import { ModeWatcher } from 'mode-watcher';

	import { now } from '$lib/stores/time';

	import { Toaster } from '$lib/components/ui/sonner';

	import { METADATA_REFRESH_INTERVAL, MILLISECONDS_PER_MINUTE } from '$lib/constants';
	import { getInitialMetaData } from '$lib/metadata';
	import { isScreenshotMode } from '$lib/screenshot';

	// In screenshot mode, don't mount the toaster so toasts never appear in captures.
	const showToaster = !isScreenshotMode();

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
</script>

{#if showToaster}
	<Toaster
		closeButton={true}
		richColors={true}
		offset={{ bottom: '85px', right: '10px' }}
		mobileOffset={{ bottom: '85px' }}
	/>
{/if}

{@render children()}
<ModeWatcher />
