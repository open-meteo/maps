<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { get } from 'svelte/store';

	import { ModeWatcher } from 'mode-watcher';
	import { pwaInfo } from 'virtual:pwa-info';

	import { preferences as p } from '$lib/stores/preferences';
	import { now } from '$lib/stores/time';

	import { Toaster } from '$lib/components/ui/sonner';

	import { getInitialMetaData } from '$lib';
	import { METADATA_REFRESH_INTERVAL, MILLISECONDS_PER_MINUTE } from '$lib/constants';

	const webManifest = $derived(pwaInfo ? pwaInfo.webManifest.linkTag : '');

	let { children } = $props();

	let preferences = $state(get(p));
	p.subscribe((newPreferences) => {
		preferences = newPreferences;
	});

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
</script>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html webManifest}
</svelte:head>

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
