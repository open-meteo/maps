<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { SvelteDate } from 'svelte/reactivity';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';

	import {
		type DomainMetaData,
		GridFactory,
		type RenderableColorScale,
		VARIABLE_PREFIX,
		closestModelRun,
		domainOptions,
		domainStep,
		omProtocol
	} from '@openmeteo/mapbox-layer';
	import { type RequestParameters } from 'maplibre-gl';
	import * as maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { Protocol } from 'pmtiles';
	import { toast } from 'svelte-sonner';

	import { version } from '$app/environment';
	import { pushState } from '$app/navigation';

	import { map, mapBounds, paddedBounds } from '$lib/stores/map';
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
		TimeButton,
		reloadStyles
	} from '$lib/components/buttons';
	import HelpDialog from '$lib/components/help/help-dialog.svelte';
	import Scale from '$lib/components/scale/scale.svelte';
	import VariableSelection from '$lib/components/selection/variable-selection.svelte';
	import Settings from '$lib/components/settings/settings.svelte';
	import TimeSelector from '$lib/components/time/time-selector.svelte';

	import {
		addHillshadeSources,
		addOmFileLayers,
		addPopup,
		changeOMfileURL,
		checkBounds,
		checkClosestDomainInterval,
		checkClosestModelRun,
		checkHighDefinition,
		getMetaData,
		getPaddedBounds,
		getStyle,
		hashValue,
		matchVariableOrFirst,
		setMapControlSettings,
		updateUrl,
		urlParamsToPreferences
	} from '$lib';
	import { fmtISOWithoutTimezone } from '$lib/index';

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

		// resets all the states when a new version is set in 'package.json' and version already set before
		if (version !== $localStorageVersion) {
			if ($localStorageVersion) {
				resetStates();
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

		$map.on('load', async () => {
			mapBounds.set($map.getBounds());
			paddedBounds.set($map.getBounds());
			getPaddedBounds();

			$map.addControl(new DarkModeButton());
			$map.addControl(new SettingsButton());
			$map.addControl(new TimeButton());
			$map.addControl(new HelpButton());
			$metaJson = await getMetaData();

			addOmFileLayers();
			addHillshadeSources();
			$map.addControl(new HillshadeButton());

			addPopup();
		});

		$map.on('zoomend', () => {
			checkBounds();
		});

		$map.on('dragend', () => {
			checkBounds();
		});
	});

	const domainSubsription = domain.subscribe(async (newDomain) => {
		await tick(); // await the selectedDomain to be set
		updateUrl('domain', newDomain);

		$metaJson = await getMetaData();

		checkClosestDomainInterval();
		// align model run with new model_interval on domain change
		$modelRun = closestModelRun($modelRun, $selectedDomain.model_interval);
		checkClosestModelRun(); // checks and updates time and model run to fit the current domain selection

		if ($modelRun.getTime() - $time.getTime() > 0) {
			$time = domainStep($modelRun, $selectedDomain.time_interval, 'forward');
		}

		matchVariableOrFirst();

		changeOMfileURL();
		toast('Domain set to: ' + $selectedDomain.label);
	});

	const variableSubsription = variable.subscribe(async (newVar) => {
		await tick(); // await the selectedVariable to be set
		updateUrl('variable', newVar);
		if (!$loading) {
			changeOMfileURL();
		}
		toast('Variable set to: ' + $selectedVariable.label);
	});

	onDestroy(() => {
		if ($map) {
			$map.remove();
		}
		domainSubsription(); // unsubscribe
		variableSubsription(); // unsubscribe
	});
</script>

<svelte:head>
	<title>Open-Meteo Maps</title>
</svelte:head>

{#if $loading}
	<div
		in:fade={{ delay: 1200, duration: 400 }}
		out:fade={{ duration: 150 }}
		class="pointer-events-none absolute top-[50%] left-[50%] z-50 transform-[translate(-50%,-50%)]"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="48"
			height="48"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="lucide lucide-loader-circle-icon lucide-loader-circle animate-spin"
			><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg
		>
	</div>
{/if}

<div class="map" id="#map_container" bind:this={mapContainer}></div>
<Scale
	showScale={$preferences.showScale}
	afterColorScaleChange={async (variable: string, colorScale: RenderableColorScale) => {
		omProtocolSettings.colorScales[variable] = colorScale;
		const colorHash = await hashValue(JSON.stringify(omProtocolSettings.colorScales));
		updateUrl('color_hash', colorHash, defaultColorHash);
		changeOMfileURL();
		toast('Changed color scale');
	}}
/>

<VariableSelection />
<TimeSelector
	bind:time={$time}
	onDateChange={(date: Date) => {
		$time = new SvelteDate(date);
		updateUrl('time', fmtISOWithoutTimezone($time));
		changeOMfileURL();
	}}
/>

<Settings
	onReset={async () => {
		resetStates();
		for (let [key] of $url.searchParams) {
			$url.searchParams.delete(key);
		}
		reloadStyles();
		await changeOmDomain($domain, false);
		changeOMfileURL();
		updateUrl();
		toast.info('All default states reset');
	}}
/>

<HelpDialog />
