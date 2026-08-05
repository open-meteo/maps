<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';

	import { variableOptions } from '@openmeteo/weather-map-layer';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { toast } from 'svelte-sonner';

	import { activeChart } from '$lib/stores/chart';
	import { epsMeta } from '$lib/stores/eps';
	import { map } from '$lib/stores/map';
	import { initStoredState, loading, url } from '$lib/stores/preferences';
	import { modelRun } from '$lib/stores/time';
	import { domain, selectedDomain } from '$lib/stores/variables';

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
	import SelectionPanel from '$lib/components/selection/selection-panel.svelte';
	import Settings from '$lib/components/settings/settings.svelte';
	import TimeSelector from '$lib/components/time/time-selector.svelte';

	import { unwatchAttributionOverlap, watchAttributionOverlap } from '$lib/attribution';
	import { getChartPreset } from '$lib/chart-presets';
	import { postEmbedderReady, startEmbedderBridge, stopEmbedderBridge } from '$lib/embed';
	import { addOmFileLayers, changeOMfileURL } from '$lib/layers';
	import { addTerrainSource, createMap } from '$lib/map-controls';
	import { loadDomainMetaData } from '$lib/metadata';
	import { addPopup } from '$lib/popup';
	import { syncChartToUrl, updateUrl, urlParamsToPreferences } from '$lib/url';

	import '../styles.css';

	import type { ChartState } from '$lib/chart-types';

	let clippingPanel: ReturnType<typeof ClippingPanel>;

	let mapContainer: HTMLElement | null;

	const darkModeButton = new DarkModeButton();

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

	const chartToastMessage = (chart: ChartState): string => {
		if (chart.presetId) {
			return 'Chart set to: ' + (getChartPreset(chart.presetId)?.label ?? chart.presetId);
		}
		if (chart.name) return 'Chart set to: ' + chart.name;
		if (chart.sources.length === 1) {
			const variable = chart.sources[0].variable;
			const label = variableOptions.find(({ value }) => value === variable)?.label ?? variable;
			return 'Variable set to: ' + label;
		}
		return 'Custom chart applied';
	};

	// Serialized sources of the last seen chart. Undefined only before the
	// subscription's initial synchronous call, which must not toast or touch
	// the URL (urlParamsToPreferences just parsed it).
	let lastChartSources: string | undefined;
	const chartSubscription = activeChart.subscribe(async (chart) => {
		const serialized = JSON.stringify(chart.sources);
		const changed = lastChartSources !== undefined && serialized !== lastChartSources;
		lastChartSources = serialized;

		if (changed) {
			await tick();
			syncChartToUrl(chart);
			toast(chartToastMessage(chart));
		}

		changeOMfileURL();
	});

	// An EPS chart source can only render once the sibling's metadata is in
	const epsSubscription = epsMeta.subscribe((meta) => {
		if (meta) changeOMfileURL();
	});

	onDestroy(() => {
		stopEmbedderBridge();
		unwatchAttributionOverlap();
		if ($map) {
			$map.remove();
		}
		domainSubscription(); // unsubscribe
		chartSubscription(); // unsubscribe
		epsSubscription(); // unsubscribe
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
<SelectionPanel />
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
