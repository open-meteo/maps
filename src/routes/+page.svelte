<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { get } from 'svelte/store';

	import {
		GridFactory,
		type RenderableColorScale,
		domainOptions,
		omProtocol,
		updateCurrentBounds
	} from '@openmeteo/mapbox-layer';
	import ShadeMap from 'mapbox-gl-shadow-simulator';
	import { type RequestParameters } from 'maplibre-gl';
	import * as maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { Protocol } from 'pmtiles';
	import { toast } from 'svelte-sonner';

	import { version } from '$app/environment';

	import { map } from '$lib/stores/map';
	import { defaultColorHash, omProtocolSettings } from '$lib/stores/om-protocol-settings';
	import {
		loading,
		localStorageVersion,
		metaJson,
		modelRun,
		preferences,
		resetStates,
		resolution,
		resolutionSet,
		time,
		url
	} from '$lib/stores/preferences';
	import { domain, selectedDomain, selectedVariable, variable } from '$lib/stores/variables';

	import {
		DarkModeButton,
		HelpButton,
		HillshadeButton,
		SettingsButton,
		TimeButton
	} from '$lib/components/buttons';
	import HelpDialog from '$lib/components/help/help-dialog.svelte';
	import Spinner from '$lib/components/loading/spinner.svelte';
	import Scale from '$lib/components/scale/scale.svelte';
	import VariableSelection from '$lib/components/selection/variable-selection.svelte';
	import Settings from '$lib/components/settings/settings.svelte';
	import TimeSelector from '$lib/components/time/time-selector.svelte';

	import {
		addHillshadeSources,
		addOmFileLayers,
		addPopup,
		changeOMfileURL,
		checkHighDefinition,
		findTimeStep,
		getInitialMetaData,
		getMetaData,
		getStyle,
		hashValue,
		matchVariableOrFirst,
		setMapControlSettings,
		updateUrl,
		urlParamsToPreferences
	} from '$lib';
	import { METADATA_REFRESH_INTERVAL } from '$lib/constants';
	import { formatISOWithoutTimezone } from '$lib/time-format';

	import '../styles.css';

	let mapContainer: HTMLElement | null;

	onMount(() => {
		$url = new URL(document.location.href);
		urlParamsToPreferences();

		// first time on load, check if monitor supports high definition, for increased tile resolution factor
		if (!get(resolutionSet)) {
			if (checkHighDefinition()) {
				resolution.set(2);
			}
			resolutionSet.set(true);
		}
	});

	onMount(async () => {
		// resets all the states when a new version is set in 'package.json' and version already set before
		if (version !== $localStorageVersion) {
			if ($localStorageVersion) {
				await resetStates();
			}
			$localStorageVersion = version;
		}
	});

	onMount(async () => {
		const protocol = new Protocol({ metadata: true });
		maplibregl.addProtocol(
			'mapterhorn',
			async (params: RequestParameters, abortController: AbortController) => {
				const [z, x, y] = params.url.replace('mapterhorn://', '').split('/').map(Number);
				const name = z <= 12 ? 'planet' : `6-${x >> (z - 6)}-${y >> (z - 6)}`;
				const url = `pmtiles://https://mapterhorn.servert.ch/${name}.pmtiles/${z}/${x}/${y}.webp`;
				return await protocol.tile({ ...params, url }, abortController);
			}
		);

		maplibregl.addProtocol('om', (params: RequestParameters) =>
			omProtocol(params, undefined, omProtocolSettings)
		);

		const style = await getStyle();

		const domainObject = domainOptions.find(({ value }) => value === $domain);
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

		$map.on('dataloading', () => {
			updateCurrentBounds($map.getBounds());
		});

		$map.on('load', async () => {
			$map.addControl(new DarkModeButton());
			$map.addControl(new SettingsButton());
			$map.addControl(new TimeButton());
			$map.addControl(new HelpButton());

			if (getInitialMetaDataPromise) await getInitialMetaDataPromise;

			addOmFileLayers();

			addHillshadeSources();
			$map.addControl(new HillshadeButton());

			const shadeMap = new ShadeMap({
				date: new Date(), // display shadows for current date
				color: '#01112f', // shade color
				opacity: 0.7, // opacity of shade color
				apiKey: '',
				terrainSource: {
					tileSize: 256,
					maxZoom: 15,
					getSourceUrl: ({ x, y, z }) => {
						return `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
					},
					getElevation: ({ r, g, b, a }) => {
						return r * 256 + g + b / 256 - 32768;
					}
				},
				debug: (msg) => {
					console.log(new Date().toISOString(), msg);
				}
			}).addTo($map);

			addPopup();
			changeOMfileURL();
		});
	});

	let getInitialMetaDataPromise: Promise<void> | undefined;
	const domainSubscription = domain.subscribe(async (newDomain) => {
		await tick(); // await the selectedDomain to be set
		updateUrl('domain', newDomain);

		$modelRun = undefined;
		getInitialMetaDataPromise = getInitialMetaData();
		await getInitialMetaDataPromise;
		$metaJson = await getMetaData();

		const timeSteps = $metaJson?.valid_times.map((validTime: string) => new Date(validTime));
		const timeStep = findTimeStep($time, timeSteps);
		// clamp time to valid times in meta data
		if (timeStep) {
			$time = timeStep;
			updateUrl('time', formatISOWithoutTimezone($time));
		}

		matchVariableOrFirst();

		changeOMfileURL();
		toast('Domain set to: ' + $selectedDomain.label);
	});

	const variableSubscription = variable.subscribe(async (newVar) => {
		await tick(); // await the selectedVariable to be set
		updateUrl('variable', newVar);
		if (!$loading) {
			changeOMfileURL();
		}
		toast('Variable set to: ' + $selectedVariable.label);
	});

	let metaDataInterval: ReturnType<typeof setInterval>;
	onMount(() => {
		metaDataInterval = setInterval(() => {
			getInitialMetaData();
		}, METADATA_REFRESH_INTERVAL);
	});

	onDestroy(() => {
		if ($map) {
			$map.remove();
		}
		domainSubscription(); // unsubscribe
		variableSubscription(); // unsubscribe

		clearInterval(metaDataInterval);
	});
</script>

<svelte:head>
	<title>Open-Meteo Maps</title>
</svelte:head>

{#if $loading}
	<Spinner />
{/if}

<div
	class="map maplibregl-map {$preferences.timeSelector ? 'time-selector-open' : ''}"
	id="#map_container"
	bind:this={mapContainer}
></div>

<Scale
	afterColorScaleChange={async (variable: string, colorScale: RenderableColorScale) => {
		omProtocolSettings.colorScales[variable] = colorScale;
		const colorHash = await hashValue(JSON.stringify(omProtocolSettings.colorScales));
		updateUrl('color_hash', colorHash, defaultColorHash);
		changeOMfileURL();
		toast('Changed color scale');
	}}
/>
<VariableSelection />
<TimeSelector />
<Settings />
<HelpDialog />
