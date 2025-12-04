<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { SvelteDate } from 'svelte/reactivity';
	import { fade } from 'svelte/transition';

	import {
		type DomainMetaData,
		GridFactory,
		OMapsFileReader,
		type OmProtocolSettings,
		defaultOmProtocolSettings,
		domainOptions,
		domainStep,
		omProtocol,
		variableOptions
	} from '@openmeteo/mapbox-layer';
	import { type RequestParameters } from 'maplibre-gl';
	import * as maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { Protocol } from 'pmtiles';
	import { toast } from 'svelte-sonner';

	import { pushState } from '$app/navigation';

	import {
		domain,
		loading,
		mapBounds,
		modelRun,
		paddedBounds,
		preferences,
		sheet,
		time,
		variables
	} from '$lib/stores/preferences';

	import {
		ClipWaterButton,
		DarkModeButton,
		HillshadeButton,
		PartialButton,
		SettingsButton,
		TimeButton
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
		getPaddedBounds,
		getStyle,
		setMapControlSettings,
		urlParamsToPreferences
	} from '$lib';
	import { fmtISOWithoutTimezone } from '$lib/index';

	import '../styles.css';

	let url: URL = $state();
	let map: maplibregl.Map = $state();
	let latestJson: DomainMetaData | undefined = $state();
	let mapContainer: HTMLElement | null;
	let fetchingVariables = $state(false);

	const changeOmDomain = async (value: string): Promise<void> => {
		$domain = domainOptions.find((dm) => dm.value === value) ?? $domain;
		checkClosestDomainInterval(url);
		url.searchParams.set('domain', $domain.value);
		url.searchParams.set('time', fmtISOWithoutTimezone($time));
		pushState(url + map._hash.getHashString(), {});
		toast('Domain set to: ' + $domain.label);
		fetchingVariables = true;
		latestJson = await getDomainData();
		fetchingVariables = false;
		const referenceTime = latestJson.reference_time;
		$modelRun = new SvelteDate(referenceTime);

		if ($modelRun.getTime() - $time.getTime() > 0) {
			$time = domainStep($modelRun, $domain.time_interval, 'forward');
		}
		if (!latestJson.variables.includes($variables[0].value)) {
			$variables = [
				variableOptions.find((v) => v.value === latestJson!.variables[0]) ?? {
					value: latestJson.variables[0],
					label: latestJson.variables[0]
				}
			];
			url.searchParams.set('variable', $variables[0].value);
			pushState(url + map._hash.getHashString(), {});
			toast('Variable set to: ' + $variables[0].label);
		}

		changeOMfileURL(map, url, latestJson);
	};

	const getDomainData = async (inProgress = false): Promise<DomainMetaData> => {
		console.log('getDomainData called');
		const uri =
			$domain.value && $domain.value.startsWith('dwd_icon')
				? `https://s3.servert.ch`
				: `https://map-tiles.open-meteo.com`;

		const metaJsonUrl = `${uri}/data_spatial/${$domain.value}/${inProgress ? 'in-progress' : 'latest'}.json`;
		console.log('fetching ', metaJsonUrl);
		const res = await fetch(metaJsonUrl);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const json = await res.json();
		return json;
	};

	onMount(() => {
		url = new URL(document.location.href);
		urlParamsToPreferences(url);
	});

	const omProtocolSettings: OmProtocolSettings = $derived({
		...defaultOmProtocolSettings,
		// static
		useSAB: true,

		// could be dynamic
		postReadCallback: (omFileReader: OMapsFileReader, omUrl: string) => {
			if (!omUrl.includes('dwd_icon')) {
				omFileReader._prefetch(omUrl);
			}
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

		const grid = GridFactory.create($domain.grid);

		map = new maplibregl.Map({
			container: mapContainer as HTMLElement,
			style: style,
			center: grid.getCenter(),
			zoom: $domain?.grid.zoom,
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
			map.addControl(new PartialButton(map, url, latestJson));
			map.addControl(new ClipWaterButton(map, url, latestJson));
			map.addControl(new TimeButton(map, url));
			changeOmDomain('');

			addOmFileLayers(map);
			addHillshadeSources(map);
			map.addControl(new HillshadeButton(map, url));

			addPopup(map);
		});

		map.on('zoomend', () => {
			checkBounds(map, url, latestJson);
		});

		map.on('dragend', () => {
			checkBounds(map, url, latestJson);
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
<Scale showScale={$preferences.showScale} variables={$variables} />

<HelpDialog />
<VariableSelection
	{url}
	{map}
	domain={$domain}
	variables={$variables}
	metaJson={latestJson}
	{fetchingVariables}
	domainChange={changeOmDomain}
	variablesChange={(value: string | undefined) => {
		$variables = [
			variableOptions.find((v) => v.value === value) ?? {
				value: value ?? '',
				label: value ?? ''
			}
		];
		url.searchParams.set('variable', $variables[0].value);
		pushState(url + map._hash.getHashString(), {});
		toast('Variable set to: ' + $variables[0].label);
		changeOMfileURL(map, url, latestJson);
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
		changeOMfileURL(map, url, latestJson);
	}}
/>
<div class="absolute">
	<Sheet.Root bind:open={$sheet}>
		<Sheet.Content
			><div class="px-6 pt-12">
				<div><h2 class="text-lg font-bold">Units</h2></div>
				<Settings {map} {url} />
			</div></Sheet.Content
		>
	</Sheet.Root>
</div>
