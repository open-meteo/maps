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
	const domainSubscription = domain.subscribe(async (newDomain) => {
		if ($domain !== newDomain) {
			await tick(); // await the selectedDomain to be set
			updateUrl('domain', newDomain);
			$modelRun = undefined;
			toast('Domain set to: ' + $selectedDomain.label);
		}

		getInitialMetaDataPromise = (async () => {
			await getInitialMetaData();
			$metaJson = await getMetaData();

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

<!-- <a
	href="https://github.com/open-meteo/maps"
	target="_blank"
	rel="noopener noreferrer"
	title="View on GitHub"
	class="maplibregl-ctrl maplibregl-ctrl-group fixed top-2.5 right-2.5 z-10 flex items-center justify-center w-7.25 h-7.25"
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="18"
		height="18"
		viewBox="0 0 24 24"
		fill="currentColor"
		opacity="0.75"
		aria-hidden="true"
	>
		<path
			d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
		/>
	</svg>
</a> -->

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

<style>
	.github-corner-svg {
		position: absolute;
		top: 0;
		right: 0;
		border: 0;
		fill: rgba(240, 240, 240, 0.8);
		color: #151513;
	}
	:global(.dark) .github-corner-svg {
		fill: rgba(15, 15, 15, 0.8);
		color: #fff;
	}
	.github-corner-blur {
		position: absolute;
		top: 0;
		right: 0;
		width: 50px;
		height: 50px;
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		/* clip-path matches the SVG triangle: M0,0 L115,115 L130,115 L142,142 L250,250 L250,0 Z */
		clip-path: polygon(0% 0%, 46% 46%, 52% 46%, 57% 57%, 100% 100%, 100% 0%);
	}
	.github-corner:hover .octo-arm {
		animation: octocat-wave 560ms ease-in-out;
	}
	@keyframes octocat-wave {
		0%,
		100% {
			transform: rotate(0);
		}
		20%,
		60% {
			transform: rotate(-25deg);
		}
		40%,
		80% {
			transform: rotate(10deg);
		}
	}
	@media (max-width: 500px) {
		.github-corner:hover .octo-arm {
			animation: none;
		}
		.github-corner .octo-arm {
			animation: octocat-wave 560ms ease-in-out;
		}
	}
</style>
