<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	import { ModeWatcher } from 'mode-watcher';
	import { toast } from 'svelte-sonner';
	import { pwaInfo } from 'virtual:pwa-info';

	import { updated } from '$app/state';

	import { now } from '$lib/stores/time';

	import { Toaster } from '$lib/components/ui/sonner';

	import { METADATA_REFRESH_INTERVAL, MILLISECONDS_PER_MINUTE } from '$lib/constants';
	import { getInitialMetaData } from '$lib/metadata';

	const webManifest = $derived(pwaInfo ? pwaInfo.webManifest.linkTag : '');

	let { children } = $props();

	let metaDataInterval: ReturnType<typeof setInterval>;
	let updateNowInterval: ReturnType<typeof setTimeout> | undefined;

	onMount(async () => {
		if (pwaInfo) {
			const { registerSW } = await import('virtual:pwa-register');
			registerSW({
				immediate: true,
				onRegistered(r) {
					console.log(`SW Registered: ${r}`);
				},
				onRegisterError(error) {
					console.log('SW registration error', error);
				}
			});
		}

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

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html webManifest}
</svelte:head>

<Toaster
	closeButton={true}
	richColors={true}
	offset={{ bottom: '85px', right: '10px' }}
	mobileOffset={{ bottom: '85px' }}
/>

{@render children()}
<ModeWatcher />
