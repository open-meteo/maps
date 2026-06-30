<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { get } from 'svelte/store';

	import {
		type Domain,
		GridFactory,
		domainOptions,
		omProtocol,
		updateCurrentBounds
	} from '@openmeteo/weather-map-layer';
	import * as maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { toast } from 'svelte-sonner';

	import { version } from '$app/environment';

	import { map } from '$lib/stores/map';
	import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
	import {
		loading,
		localStorageVersion,
		resetStates,
		tileSize,
		tileSizeSet,
		url
	} from '$lib/stores/preferences';
	import { metaJson, modelRun, time } from '$lib/stores/time';
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
	import HelpDialog from '$lib/components/help/help-dialog.svelte';
	import KeyboardHandler from '$lib/components/keyboard/keyboard-handler.svelte';
	import Spinner from '$lib/components/loading/spinner.svelte';
	import Scale from '$lib/components/scale/scale.svelte';
	import VariableSelection from '$lib/components/selection/variable-selection.svelte';
	import Settings from '$lib/components/settings/settings.svelte';
	import TimeSelector from '$lib/components/time/time-selector.svelte';

	import { checkHighDefinition } from '$lib/helpers';
	import { addOmFileLayers, changeOMfileURL } from '$lib/layers';
	import { loadLocalOmFile } from '$lib/load-local-file';
	import { addTerrainSource, getStyle, setMapControlSettings } from '$lib/map-controls';
	import { getInitialMetaData, getMetaData, matchVariableOrFirst } from '$lib/metadata';
	import { addPopup } from '$lib/popup';
	import { formatISOWithoutTimezone } from '$lib/time-format';
	import { findTimeStep } from '$lib/time-utils';
	import { updateUrl, urlParamsToPreferences } from '$lib/url';

	import '../styles.css';

	import type { RequestParameters } from 'maplibre-gl';

	let clippingPanel: ReturnType<typeof ClippingPanel>;

	let mapContainer: HTMLElement | null;

	onMount(async () => {
		$url = new URL(document.location.href);
		urlParamsToPreferences();

		// first time on load, check if monitor supports high definition, for increased tile size
		if (!get(tileSizeSet)) {
			if (checkHighDefinition()) {
				tileSize.set(1024);
			}
			tileSizeSet.set(true);
		}

		// resets all the states when a new version is set in 'package.json' and version already set before
		if (version !== $localStorageVersion) {
			if ($localStorageVersion) {
				await resetStates();
			}
			$localStorageVersion = version;
		}

		maplibregl.addProtocol('om', (params: RequestParameters, abortController: AbortController) =>
			omProtocol(params, abortController, $omProtocolSettings)
		);

		const style = await getStyle();

		const domainObject = domainOptions.find(({ value }: Domain) => value === $domain);
		if (!domainObject) {
			throw new Error('Domain not found');
		}
		const grid = GridFactory.create(domainObject.grid);

		$map = new maplibregl.Map({
			container: mapContainer as HTMLElement,
			style: style,
			center: grid.getCenter(),
			zoom: domainObject.grid.zoom,
			keyboard: false,
			hash: true,
			maxPitch: 85
		});

		setMapControlSettings();

		// update bounds when new tiles are requested, to trigger new data ranges loading if necessary
		$map.on('dataloading', () => {
			const bounds = $map.getBounds();
			const [minLng, minLat] = bounds.getSouthWest().toArray();
			const [maxLng, maxLat] = bounds.getNorthEast().toArray();
			updateCurrentBounds([minLng, minLat, maxLng, maxLat]);
		});

		$map.on('load', async () => {
			$map.addControl(new DarkModeButton());
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

		getInitialMetaDataPromise = (async () => {
			await getInitialMetaData();
			// Bail out if a newer domain change superseded this load while metadata was
			// being fetched, so we don't commit another domain's metadata/time.
			if (get(domain) !== newDomain) return;
			const meta = await getMetaData();
			if (get(domain) !== newDomain) return;
			$metaJson = meta;

			const timeSteps = $metaJson?.valid_times.map((validTime: string) => new Date(validTime));
			const timeStep = findTimeStep($time, timeSteps);
			// clamp time to valid times in meta data
			if (timeStep) {
				$time = timeStep;
				updateUrl('time', formatISOWithoutTimezone($time));
			} else {
				// otherwise use first valid time
				$time = timeSteps[0];
				updateUrl('time', formatISOWithoutTimezone($time));
			}

			matchVariableOrFirst();
		})();
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

<a
	href="https://github.com/open-meteo/maps"
	class="github-corner"
	aria-label="View source on GitHub"
	><div class="github-corner-blur" aria-hidden="true"></div>
	<svg width="50" height="50" viewBox="0 0 250 250" class="github-corner-svg" aria-hidden="true"
		><path d="M0,0 L115,115 L130,115 L142,142 L250,250 L250,0 Z" /><path
			d="M128.3,109.0 C113.8,99.7 119.0,89.6 119.0,89.6 C122.0,82.7 120.5,78.6 120.5,78.6 C119.2,72.0 123.4,76.3 123.4,76.3 C127.3,80.9 125.5,87.3 125.5,87.3 C122.9,97.6 130.6,101.9 134.4,103.2"
			fill="currentColor"
			style="transform-origin: 130px 106px;"
			class="octo-arm"
		/><path
			d="M115.0,115.0 C114.9,115.1 118.7,116.5 119.8,115.4 L133.7,101.6 C136.9,99.2 139.9,98.4 142.2,98.6 C133.8,88.0 127.5,74.4 143.8,58.0 C148.5,53.4 154.0,51.2 159.7,51.0 C160.3,49.4 163.2,43.6 171.4,40.1 C171.4,40.1 176.1,42.5 178.8,56.2 C183.1,58.6 187.2,61.8 190.9,65.4 C194.5,69.0 197.7,73.2 200.1,77.6 C213.8,80.2 216.3,84.9 216.3,84.9 C212.7,93.1 206.9,96.0 205.4,96.6 C205.1,102.4 203.0,107.8 198.3,112.5 C181.9,128.9 168.3,122.5 157.7,114.1 C157.9,116.9 156.7,120.9 152.7,124.9 L141.0,136.5 C139.8,137.7 141.6,141.9 141.8,141.8 Z"
			fill="currentColor"
			class="octo-body"
		/></svg
	></a
>
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
	onOmFile={loadLocalOmFile}
/>
