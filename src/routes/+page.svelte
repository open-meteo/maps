<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { get } from 'svelte/store';

	import {
		type Domain,
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
		SettingsButton,
		TimeButton
	} from '$lib/components/buttons';
	import ClippingPanel from '$lib/components/clipping/clipping-panel.svelte';
	import { loadCountriesFromCodes } from '$lib/components/clipping/country-data';
	import HelpDialog from '$lib/components/help/help-dialog.svelte';
	import Spinner from '$lib/components/loading/spinner.svelte';
	import Scale from '$lib/components/scale/scale.svelte';
	import VariableSelection from '$lib/components/selection/variable-selection.svelte';
	import Settings from '$lib/components/settings/settings.svelte';
	import TimeSelector from '$lib/components/time/time-selector.svelte';

	import {
		CLIP_COUNTRIES_PARAM,
		buildCountryClippingOptions,
		serializeClipCountriesParam
	} from '$lib/clipping';
	import { checkHighDefinition, hashValue } from '$lib/helpers';
	import { addOmFileLayers, changeOMfileURL } from '$lib/layers';
	import { addTerrainSource, getStyle, setMapControlSettings } from '$lib/map-controls';
	import { getInitialMetaData, getMetaData, matchVariableOrFirst } from '$lib/metadata';
	import { addPopup } from '$lib/popup';
	import { formatISOWithoutTimezone } from '$lib/time-format';
	import { findTimeStep } from '$lib/time-utils';
	import { updateUrl, urlParamsToPreferences } from '$lib/url';

	import '../styles.css';

	import type { Country } from '$lib/components/clipping/country-data';
	import type { RequestParameters } from 'maplibre-gl';

	let clippingPanel: ReturnType<typeof ClippingPanel>;

	let mapContainer: HTMLElement | null;

	onMount(() => {
		$url = new URL(document.location.href);
		urlParamsToPreferences();

		// first time on load, check if monitor supports high definition, for increased tile size
		if (!get(tileSizeSet)) {
			if (checkHighDefinition()) {
				tileSize.set(1024);
			}
			tileSizeSet.set(true);
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

	const handleCountrySelect = (countries: Country[]) => {
		updateUrl(CLIP_COUNTRIES_PARAM, serializeClipCountriesParam($clippingCountryCodes));
		const nextClipping = buildCountryClippingOptions(countries);
		clippingPanel?.setCountryClipping(nextClipping);
	};

	onMount(async () => {
		if ($clippingCountryCodes.length > 0) {
			const countries = await loadCountriesFromCodes($clippingCountryCodes);
			handleCountrySelect(countries);
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
<ClippingPanel
	bind:this={clippingPanel}
	onselect={handleCountrySelect}
	onclippingchange={async () => {
		await tick();
		changeOMfileURL();
		if ($map) $map.fire('dataloading');
	}}
/>
<TimeSelector />
<Settings />
<HelpDialog />
