<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';

	import { variableOptions } from '@openmeteo/weather-map-layer';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { mode, userPrefersMode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';

	import { browser } from '$app/env';

	import { activeChart } from '#lib/stores/chart.js';
	import { map } from '#lib/stores/map.js';
	import { initStoredState, loading, opacity, url } from '#lib/stores/preferences.js';
	import { installRequestCounter } from '#lib/stores/request-counter.js';
	import { modelRun } from '#lib/stores/time.js';
	import { domain, selectedDomain } from '#lib/stores/variables.js';

	import {
		ClippingButton,
		DarkModeButton,
		HelpButton,
		HillshadeButton,
		SettingsButton
	} from '#lib/components/buttons/index.js';
	import ClippingPanel from '#lib/components/clipping/clipping-panel.svelte';
	import Dropzone from '#lib/components/dropzone/dropzone.svelte';
	import GithubCorner from '#lib/components/github/github-corner.svelte';
	import HelpDialog from '#lib/components/help/help-dialog.svelte';
	import KeyboardHandler from '#lib/components/keyboard/keyboard-handler.svelte';
	import Spinner from '#lib/components/loading/spinner.svelte';
	import Scale from '#lib/components/scale/scale.svelte';
	import SelectionPanel from '#lib/components/selection/selection-panel.svelte';
	import Settings from '#lib/components/settings/settings.svelte';
	import TimeSelector from '#lib/components/time/time-selector.svelte';

	import { unwatchAttributionOverlap, watchAttributionOverlap } from '#lib/attribution.js';
	import {
		bestMatchView,
		drawBestMatchRegions,
		fitBestMatchView,
		isBestMatchScreenshot
	} from '#lib/best-match-screenshot.js';
	import { getChartPreset } from '#lib/chart-presets.js';
	import { postEmbedderReady, startEmbedderBridge, stopEmbedderBridge } from '#lib/embed.js';
	import { addOmFileLayers, changeOMfileURL } from '#lib/layers.js';
	import {
		addTerrainSource,
		createMap,
		getAppliedStyleMode,
		reloadStyles
	} from '#lib/map-controls.js';
	import { loadDomainMetaData } from '#lib/metadata.js';
	import { addPopup } from '#lib/popup.js';
	import {
		drawSatelliteCoverage,
		fitSatelliteView,
		isSatelliteScreenshot
	} from '#lib/satellite-screenshot.js';
	import {
		SCREENSHOT_RASTER_OPACITY,
		drawDomainBorder,
		exposeDomainList,
		fitToDomain,
		isScreenshotMode,
		markReadyWhenSettled
	} from '#lib/screenshot.js';
	import { syncChartToUrl, updateUrl, urlParamsToPreferences } from '#lib/url.js';

	import '../styles.css';

	import type { ChartState } from '#lib/chart-types.js';

	let clippingPanel = $state<ReturnType<typeof ClippingPanel>>();

	let mapContainer: HTMLElement | null;

	// Screenshot mode (`?screenshot=1`) strips the UI and frames a single domain so
	// screenshots can be captured reproducibly (see scripts/domain-screenshots.mjs).
	const screenshot = isScreenshotMode();
	// Special screenshot views that draw an overlay on the plain base map instead of a
	// weather-model domain: the geostationary satellites (satellite-screenshot.ts) and the
	// best_match region map (best-match-screenshot.ts). Neither needs domain data or
	// weather layers, so they run a minimal self-contained setup and skip the rest.
	const satelliteView = isSatelliteScreenshot();
	const bestMatchRegionView = isBestMatchScreenshot();
	const overlayView = satelliteView || bestMatchRegionView;

	const setupOverlayView = async () => {
		await createMap(mapContainer as HTMLElement, { screenshot: true });
		$map.on('load', () => {
			if (satelliteView) {
				fitSatelliteView($map);
				drawSatelliteCoverage($map);
			} else {
				const view = bestMatchView();
				fitBestMatchView($map, view);
				drawBestMatchRegions($map, view);
			}
			// There's no weather data to fetch here, but `loading` starts true; clear it so
			// the screenshot readiness check (markReadyWhenSettled) can settle.
			loading.set(false);
			markReadyWhenSettled($map);
		});
	};

	const darkModeButton = new DarkModeButton();

	// Before any data access: every request to the data API counts against the
	// daily limit, and the wrapper also reroutes them once it is exhausted.
	installRequestCounter();

	// The single place that keeps the basemap in sync with the RESOLVED theme:
	// covers the button cycle, an OS light/dark switch while the theme is
	// 'system', and an embedder propagating its colour scheme into ours. The
	// style only reloads when the resolved mode actually drifts from what the
	// map has applied, so redundant transitions (e.g. picking 'system' on a
	// dark OS while already dark) reload nothing.
	$effect(() => {
		const resolved = mode.current === 'dark' ? 'dark' : 'light';
		void userPrefersMode.current; // icon shows the preference, not the resolved mode
		if (!$map) return;
		darkModeButton.refresh();
		if (resolved !== getAppliedStyleMode()) {
			reloadStyles();
		}
	});

	onMount(async () => {
		$url = new URL(document.location.href);
		urlParamsToPreferences();
		await initStoredState();

		// Scopes screenshot-only styling (e.g. the smaller attribution, see styles.css).
		if (screenshot) mapContainer?.classList.add('screenshot-mode');

		if (overlayView) {
			await setupOverlayView();
			return;
		}

		if (screenshot) {
			exposeDomainList();
			// Keep the weather raster subtle so the base map / border stay readable.
			const opacityParam = Number($url.searchParams.get('opacity'));
			opacity.set(
				Number.isFinite(opacityParam) && opacityParam > 0 ? opacityParam : SCREENSHOT_RASTER_OPACITY
			);
		}

		await createMap(mapContainer as HTMLElement, { screenshot });
		startEmbedderBridge();

		$map.on('load', async () => {
			if (!screenshot) {
				$map.addControl(darkModeButton);
				$map.addControl(new SettingsButton());
				$map.addControl(new HelpButton());
				$map.addControl(new ClippingButton());
			}

			if (getInitialMetaDataPromise) await getInitialMetaDataPromise;
			// Initial URL-driven setup is finished; from now on domain changes are
			// user-initiated and should reset the selected model run.
			initialLoadComplete = true;

			if (!screenshot) {
				addTerrainSource($map);
				addTerrainSource($map, 'terrainSource2');
				$map.addControl(new HillshadeButton());
				clippingPanel?.initTerraDraw();
			}

			// Frame the domain before loading data so tiles load once for the final view.
			if (screenshot) fitToDomain($map);

			addOmFileLayers();
			if (!screenshot) addPopup();
			changeOMfileURL();

			if (screenshot) {
				drawDomainBorder($map);
				markReadyWhenSettled($map);
				return;
			}

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
		// Data loads client-side only: fetching during SSR is wasted work (SvelteKit
		// warns about it), and if the fetch rejects (e.g. no network) the unhandled
		// rejection kills the vite dev server.
		if (!browser) return;
		// The overlay screenshot views have no domain data to load.
		if (overlayView) return;
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
		// The overlay screenshot views have no weather layer to reconfigure.
		if (overlayView) return;
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

	onDestroy(() => {
		stopEmbedderBridge();
		unwatchAttributionOverlap();
		if ($map) {
			$map.remove();
		}
		domainSubscription(); // unsubscribe
		chartSubscription(); // unsubscribe
	});
</script>

<svelte:head>
	<title>Open-Meteo Maps</title>
</svelte:head>

{#if $loading && !screenshot}
	<Spinner />
{/if}

<div class="map maplibregl-map" id="#map_container" bind:this={mapContainer}></div>

{#if !screenshot}
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
{/if}
