<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { SvelteDate } from 'svelte/reactivity';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';

	import {
		type DomainMetaData,
		GridFactory,
		type RenderableColorScale,
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
		localStorageVersion as lSV,
		loading,
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
		getPaddedBounds,
		getStyle,
		hashValue,
		setMapControlSettings,
		updateUrl,
		urlParamsToPreferences
	} from '$lib';
	import { VARIABLE_PREFIX } from '$lib/constants';
	import { fmtISOWithoutTimezone } from '$lib/index';

	import '../styles.css';

	let mapContainer: HTMLElement | null;

	const changeOmDomain = async (newValue: string, updateUrlState = true): Promise<void> => {
		loading.set(true);

		const object = domainOptions.find(({ value }) => value === newValue);
		if (!object) {
			throw new Error('Domain not found');
		} else {
			if (newValue) $domain = newValue;
		}

		checkClosestDomainInterval();

		if (updateUrlState) {
			$url.searchParams.set('domain', $domain);
			$url.searchParams.set('time', fmtISOWithoutTimezone($time));
			pushState($url + $map._hash.getHashString(), {});
			toast('Domain set to: ' + object.label);
		}
		$metaJson = await getDomainData();

		// align model run with new model_interval on domain change
		$modelRun = closestModelRun($modelRun, object.model_interval);
		checkClosestModelRun(); // checks and updates time and model run to fit the current domain selection

		if ($modelRun.getTime() - $time.getTime() > 0) {
			$time = domainStep($modelRun, object.time_interval, 'forward');
		}

		let matchedVariable = undefined;
		if (!$metaJson.variables.includes($variable)) {
			// check for similar level variables
			const prefixMatch = $variable.match(VARIABLE_PREFIX);
			const prefix = prefixMatch?.groups?.prefix;
			if (prefix) {
				for (let mjVariable of $metaJson.variables) {
					if (mjVariable.startsWith(prefix)) {
						matchedVariable = mjVariable;
						break;
					}
				}
			}

			if (!matchedVariable) {
				matchedVariable = $metaJson.variables[0];
			}
		}
		if (matchedVariable) {
			$variable = matchedVariable;
			// $url.searchParams.set('variable', $variable);
			// pushState($url + $map._hash.getHashString(), {});
			// toast('Variable set to: ' + $variable);
		}

		changeOMfileURL();
	};

	const getDomainData = async (inProgress = false): Promise<DomainMetaData> => {
		const uri =
			$domain && $domain.startsWith('dwd_icon')
				? `https://s3.servert.ch`
				: `https://map-tiles.open-meteo.com`;

		const metaJsonUrl = `${uri}/data_spatial/${$domain}/${inProgress ? 'in-progress' : 'latest'}.json`;
		const metaJsonResult = await fetch(metaJsonUrl);
		if (!metaJsonResult.ok) {
			loading.set(false);
			throw new Error(`HTTP ${metaJsonResult.status}`);
		}
		const json = await metaJsonResult.json();
		return json;
	};

	let localStorageVersion = $derived(get(lSV));
	onMount(() => {
		$url = new URL(document.location.href);
		urlParamsToPreferences();

		// first time check if monitor supports high definition, for increased tileResolution
		if (!get(resolutionSet)) {
			if (checkHighDefinition()) {
				resolution.set(2);
			}
			resolutionSet.set(true);
		}

		// resets all the states when a new version is set in 'package.json'
		// and version already set before
		if (version !== localStorageVersion) {
			if (localStorageVersion) {
				resetStates();
			}
			lSV.set(version);
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
			$metaJson = await getDomainData();

			addOmFileLayers();
			addHillshadeSources();
			$map.addControl(new HillshadeButton());

			addPopup();
		});

		$map.on('zoomend', () => {
			checkBounds($metaJson);
		});

		$map.on('dragend', () => {
			checkBounds($metaJson);
		});
	});

	onDestroy(() => {
		if ($map) {
			$map.remove();
		}
	});

	domain.subscribe((newDomain) => {
		toast('Domain set to: ' + $selectedDomain.label);
	});

	variable.subscribe((newVariable) => {
		updateUrl('variable', newVariable);
		changeOMfileURL();
		toast('Variable set to: ' + $selectedVariable.label);
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

<VariableSelection domainChange={changeOmDomain} />
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
