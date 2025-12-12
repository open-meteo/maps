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

	import {
		domain,
		localStorageVersion as lSV,
		loading,
		mapBounds,
		modelRun,
		paddedBounds,
		preferences,
		resetStates,
		resolution,
		resolutionSet,
		selectedVariable,
		sheet,
		time,
		variable
	} from '$lib/stores/preferences';
	import { metaJson } from '$lib/stores/state';
	import { omProtocolSettings } from '$lib/stores/state';

	import {
		ClipWaterButton,
		DarkModeButton,
		HillshadeButton,
		PartialButton,
		SettingsButton,
		TimeButton,
		reloadStyles
	} from '$lib/components/buttons';
	import HelpDialog from '$lib/components/help/help-dialog.svelte';
	import Scale from '$lib/components/scale/scale.svelte';
	import VariableSelection from '$lib/components/selection/variable-selection.svelte';
	import Settings from '$lib/components/settings/settings.svelte';
	import TimeSelector from '$lib/components/time/time-selector.svelte';
	import * as Sheet from '$lib/components/ui/sheet';

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
		setMapControlSettings,
		urlParamsToPreferences
	} from '$lib';
	import { fmtISOWithoutTimezone } from '$lib/index';

	import '../styles.css';

	let url: URL = $state() as URL;
	let map: maplibregl.Map = $state() as maplibregl.Map;

	let mapContainer: HTMLElement | null;

	let color_toggle = false;

	const changeOmDomain = async (newValue: string, updateUrlState = true): Promise<void> => {
		loading.set(true);

		const object = domainOptions.find(({ value }) => value === newValue);
		if (!object) {
			throw new Error('Domain not found');
		} else {
			if (newValue) $domain = newValue;
		}

		checkClosestDomainInterval(url);
		if (updateUrlState) {
			url.searchParams.set('domain', $domain);
			url.searchParams.set('time', fmtISOWithoutTimezone($time));
			pushState(url + map._hash.getHashString(), {});
			toast('Domain set to: ' + object.label);
		}
		$metaJson = await getDomainData();

		// align model run with new model_interval on domain change
		$modelRun = closestModelRun($modelRun, object.model_interval);
		checkClosestModelRun(map, url, $metaJson); // checks and updates time and model run to fit the current domain selection

		if ($modelRun.getTime() - $time.getTime() > 0) {
			$time = domainStep($modelRun, object.time_interval, 'forward');
		}
		if (!$metaJson.variables.includes($variable)) {
			$variable = $metaJson.variables[0];
			url.searchParams.set('variable', $variable);
			pushState(url + map._hash.getHashString(), {});
			toast('Variable set to: ' + $variable);
		}

		changeOMfileURL(map, url, $metaJson);
	};

	const getDomainData = async (inProgress = false): Promise<DomainMetaData> => {
		const uri =
			$domain && $domain.startsWith('dwd_icon')
				? `https://s3.servert.ch`
				: `https://map-tiles.open-meteo.com`;

		const metaJsonUrl = `${uri}/data_spatial/${$domain}/${inProgress ? 'in-progress' : 'latest'}.json`;
		const res = await fetch(metaJsonUrl);
		if (!res.ok) {
			loading.set(false);
			throw new Error(`HTTP ${res.status}`);
		}
		const json = await res.json();
		return json;
	};

	let localStorageVersion = $derived(get(lSV));
	onMount(() => {
		url = new URL(document.location.href);
		urlParamsToPreferences(url);

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

		map = new maplibregl.Map({
			container: mapContainer as HTMLElement,
			style: style,
			center: grid.getCenter(),
			zoom: domainObject.grid.zoom,
			keyboard: false,
			hash: true,
			maxPitch: 85
		});

		setMapControlSettings(map, url);

		map.on('load', async () => {
			mapBounds.set(map.getBounds());
			paddedBounds.set(map.getBounds());
			getPaddedBounds(map);

			map.addControl(new DarkModeButton(map, url));
			map.addControl(new SettingsButton());
			map.addControl(new PartialButton(map, url, $metaJson));
			map.addControl(new ClipWaterButton(map, url, $metaJson));
			map.addControl(new TimeButton(map, url));
			$metaJson = await getDomainData();

			addOmFileLayers(map);
			addHillshadeSources(map);
			map.addControl(new HillshadeButton(map, url));

			addPopup(map);
		});

		map.on('zoomend', () => {
			checkBounds(map, url, $metaJson);
		});

		map.on('dragend', () => {
			checkBounds(map, url, $metaJson);
		});
	});

	onDestroy(() => {
		if (map) {
			map.remove();
		}
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
	afterColorScaleChange={(variable: string, colorScale: RenderableColorScale) => {
		color_toggle = !color_toggle;
		omProtocolSettings.colorScales[variable] = colorScale;
		url.searchParams.set('color_toggle', color_toggle ? 'true' : 'false');
		changeOMfileURL(map, url, $metaJson);
		toast('Changed color scale');
	}}
/>

<HelpDialog />
<VariableSelection
	domainChange={changeOmDomain}
	variableChange={(newValue: string | undefined) => {
		if (newValue) $variable = newValue;
		url.searchParams.set('variable', $variable);
		pushState(url + map._hash.getHashString(), {});
		changeOMfileURL(map, url, $metaJson);
		toast('Variable set to: ' + $selectedVariable.label);
	}}
/>
<TimeSelector
	bind:time={$time}
	bind:domain={$domain}
	disabled={$loading}
	timeSelector={$preferences.timeSelector}
	onDateChange={(date: Date) => {
		$time = new SvelteDate(date);
		url.searchParams.set('time', fmtISOWithoutTimezone($time));
		pushState(url + map._hash.getHashString(), {});
		changeOMfileURL(map, url, $metaJson);
	}}
/>
<div class="absolute">
	<Sheet.Root bind:open={$sheet}>
		<Sheet.Content
			><div class="px-6 pt-12">
				<div><h2 class="text-lg font-bold">Units</h2></div>
				<Settings
					{map}
					{url}
					onReset={async () => {
						resetStates();
						for (let [key] of url.searchParams) {
							url.searchParams.delete(key);
						}
						reloadStyles(map);
						await changeOmDomain($domain, false);
						changeOMfileURL(map, url, $metaJson);
						pushState(url + map._hash.getHashString(), {});
						toast('Reset all states to default');
					}}
				/>
			</div></Sheet.Content
		>
	</Sheet.Root>
</div>
