<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';

	import 'maplibre-gl/dist/maplibre-gl.css';
	import { toast } from 'svelte-sonner';

	import { map } from '$lib/stores/map';
	import { initStoredState, loading, url } from '$lib/stores/preferences';
	import { installRequestCounter } from '$lib/stores/request-counter';
	import { modelRun } from '$lib/stores/time';
	import { domain, selectedDomain, selectedVariable, variable } from '$lib/stores/variables';

	import {
		ClippingButton,
		DarkModeButton,
		HelpButton,
		HillshadeButton,
		SettingsButton
	} from '$lib/components/buttons';
	import ClippingPanel from '$lib/components/clipping/clipping-panel.svelte';
	import Dropzone from '$lib/components/dropzone/dropzone.svelte';
	import GithubCorner from '$lib/components/github/github-corner.svelte';
	import HelpDialog from '$lib/components/help/help-dialog.svelte';
	import KeyboardHandler from '$lib/components/keyboard/keyboard-handler.svelte';
	import Spinner from '$lib/components/loading/spinner.svelte';
	import Scale from '$lib/components/scale/scale.svelte';
	import VariableSelection from '$lib/components/selection/variable-selection.svelte';
	import Settings from '$lib/components/settings/settings.svelte';
	import TimeSelector from '$lib/components/time/time-selector.svelte';

	import { unwatchAttributionOverlap, watchAttributionOverlap } from '$lib/attribution';
	import { postEmbedderReady, startEmbedderBridge, stopEmbedderBridge } from '$lib/embed';
	import { addOmFileLayers, changeOMfileURL } from '$lib/layers';
	import { addTerrainSource, createMap } from '$lib/map-controls';
	import { loadDomainMetaData } from '$lib/metadata';
	import { addPopup } from '$lib/popup';
	import { updateUrl, urlParamsToPreferences } from '$lib/url';

	import '../styles.css';

	let clippingPanel: ReturnType<typeof ClippingPanel>;

	let mapContainer: HTMLElement | null;

	const darkModeButton = new DarkModeButton();

	// Before any data access: every request to the data API counts against the
	// daily limit, and the wrapper also reroutes them once it is exhausted.
	installRequestCounter();

	onMount(async () => {
		$url = new URL(document.location.href);
		urlParamsToPreferences();
		await initStoredState();

		await createMap(mapContainer as HTMLElement);
		startEmbedderBridge(darkModeButton);

		$map.on('load', async () => {
			$map.addControl(darkModeButton);
			$map.addControl(new SettingsButton());
			$map.addControl(new HelpButton());
			$map.addControl(new ClippingButton());

			if (getInitialMetaDataPromise) await getInitialMetaDataPromise;
			// Initial URL-driven setup is finished; from now on domain changes are
			// user-initiated and should reset the selected model run.
			initialLoadComplete = true;

			addTerrainSource($map);
			addTerrainSource($map, 'terrainSource2');
			$map.addControl(new HillshadeButton());
			clippingPanel?.initTerraDraw();

			addOmFileLayers();
			addPopup();
			changeOMfileURL();

			watchAttributionOverlap();
			postEmbedderReady();
		});
	});

	let getInitialMetaDataPromise: Promise<void> | undefined;
	// Guards the domain subscription so the very first domain change (driven by the
	// URL on page load) does not discard a model_run/time that was just parsed from
	// the URL. Only genuine, user-initiated domain switches should reset the run.
	let initialLoadComplete = false;
	const domainSubscription = domain.subscribe(async (newDomain) => {
		if ($domain !== newDomain) {
			await tick(); // await the selectedDomain to be set
			updateUrl('domain', newDomain);
			if (initialLoadComplete) {
				$modelRun = undefined;
				toast('Domain set to: ' + $selectedDomain.label);
			}
		}

		getInitialMetaDataPromise = loadDomainMetaData(newDomain);
		await getInitialMetaDataPromise;
		changeOMfileURL();
	});

	const variableSubscription = variable.subscribe(async (newVar) => {
		if ($variable !== newVar) {
			await tick(); // await the selectedVariable to be set
			updateUrl('variable', newVar);
			toast('Variable set to: ' + $selectedVariable.label);
		}

		changeOMfileURL();
	});

	onDestroy(() => {
		stopEmbedderBridge();
		unwatchAttributionOverlap();
		if ($map) {
			$map.remove();
		}
		domainSubscription(); // unsubscribe
		variableSubscription(); // unsubscribe
	});
</script>

<svelte:head>
	<title>Open-Meteo Maps</title>
</svelte:head>

{#if $loading}
	<Spinner />
{/if}

<div class="map maplibregl-map" id="#map_container" bind:this={mapContainer}></div>

<GithubCorner />
<Scale />
<VariableSelection />
<ClippingPanel bind:this={clippingPanel} />
<TimeSelector />
<Settings />
<HelpDialog />
<KeyboardHandler />
<Dropzone
	ondrop={(features) => {
		clippingPanel?.addImportedFeatures(features);
	}}
/>
