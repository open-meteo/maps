<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { get } from 'svelte/store';

	import {
		type Bounds,
		GridFactory,
		type RenderableColorScale,
		domainOptions,
		omProtocol,
		updateCurrentBounds
	} from '@openmeteo/mapbox-layer';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { toast } from 'svelte-sonner';

	import { version } from '$app/environment';

	import { clippingCountryCodes } from '$lib/stores/clipping';
	import { map } from '$lib/stores/map';
	import { defaultColorHash, omProtocolSettings } from '$lib/stores/om-protocol-settings';
	import {
		loading,
		localStorageVersion,
		preferences,
		resetStates,
		resolution,
		resolutionSet,
		url
	} from '$lib/stores/preferences';
	import { metaJson, modelRun, time } from '$lib/stores/time';
	import { domain, selectedDomain, selectedVariable, variable } from '$lib/stores/variables';
	import { vectorOptions } from '$lib/stores/vector';

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
	import CountrySelector, { type Country } from '$lib/components/selection/country-selector.svelte';
	import VariableSelection from '$lib/components/selection/variable-selection.svelte';
	import Settings from '$lib/components/settings/settings.svelte';
	import TimeSelector from '$lib/components/time/time-selector.svelte';

	import {
		addHillshadeSources,
		addOmRasterLayers,
		addPopup,
		addVectorLayers,
		changeOMfileURL,
		checkHighDefinition,
		findTimeStep,
		getInitialMetaData,
		getMetaData,
		getStyle,
		hashValue,
		matchVariableOrFirst,
		removeOldVectorLayers,
		removeOmRasterLayers,
		setMapControlSettings,
		throttle,
		updateUrl,
		urlParamsToPreferences
	} from '$lib';
	import {
		CLIP_COUNTRIES_PARAM,
		buildCountryClippingOptions,
		isSameCountrySelection,
		serializeClipCountriesParam
	} from '$lib/clipping';
	import { formatISOWithoutTimezone } from '$lib/time-format';

	import '../styles.css';

	import type { RequestParameters } from 'maplibre-gl';

	let mapContainer: HTMLElement | null;

	const throttledUpdateCurrentBounds = throttle((bounds: Bounds) => {
		updateCurrentBounds(bounds);
	}, 100);

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
		maplibregl.addProtocol('om', (params: RequestParameters) =>
			omProtocol(params, undefined, $omProtocolSettings)
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
			const bounds = $map.getBounds();
			updateCurrentBounds([
				bounds.getWest(),
				bounds.getSouth(),
				bounds.getEast(),
				bounds.getNorth()
			]);
		});

		$map.on('load', async () => {
			$map.addControl(new DarkModeButton());
			$map.addControl(new SettingsButton());
			$map.addControl(new TimeButton());
			$map.addControl(new HelpButton());

			if (getInitialMetaDataPromise) await getInitialMetaDataPromise;

			addOmRasterLayers();
			if ($vectorOptions.contours || $vectorOptions.arrows || $vectorOptions.grid) {
				addVectorLayers();
			}
			addHillshadeSources();
			$map.addControl(new HillshadeButton());

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

		getInitialMetaDataPromise = getInitialMetaData();
		await getInitialMetaDataPromise;
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
		changeOMfileURL();
	});

	const variableSubscription = variable.subscribe(async (newVar) => {
		if ($variable !== newVar) {
			await tick(); // await the selectedVariable to be set
			updateUrl('variable', newVar);
			toast('Variable set to: ' + $selectedVariable.label);
		}

		if (!$loading) {
			changeOMfileURL();
		}
	});

	onDestroy(() => {
		if ($map) {
			$map.remove();
		}
		domainSubscription(); // unsubscribe
		variableSubscription(); // unsubscribe
	});

	let selectedCountries = $state<string[]>([]);
	const handleCountrySelect = async (countries: Country[]) => {
		if (!isSameCountrySelection(selectedCountries, $clippingCountryCodes)) {
			clippingCountryCodes.set(selectedCountries);
			updateUrl(CLIP_COUNTRIES_PARAM, serializeClipCountriesParam(selectedCountries));
		}

		const nextClipping = buildCountryClippingOptions(countries);
		if ($omProtocolSettings.clippingOptions !== nextClipping) {
			$omProtocolSettings.clippingOptions = nextClipping;
			removeOmRasterLayers();
			removeOldVectorLayers();
			await tick();
			addOmRasterLayers();
			addVectorLayers();
			changeOMfileURL();
			$map.fire('dataloading');
		}
	};

	onMount(() => {
		if (!isSameCountrySelection(selectedCountries, $clippingCountryCodes)) {
			selectedCountries = $clippingCountryCodes;
		}
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
		$omProtocolSettings.colorScales[variable] = colorScale;
		const colorHash = await hashValue(JSON.stringify($omProtocolSettings.colorScales));
		updateUrl('color_hash', colorHash, defaultColorHash);
		changeOMfileURL();
		toast('Changed color scale');
	}}
/>
<VariableSelection />
<CountrySelector bind:selectedCountries onselect={handleCountrySelect} />
<TimeSelector />
<Settings />
<HelpDialog />
