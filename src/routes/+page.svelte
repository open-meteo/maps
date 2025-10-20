<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	import { fade } from 'svelte/transition';

	import { SvelteDate } from 'svelte/reactivity';

	import { toast } from 'svelte-sonner';

	import * as maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';

	import { pushState } from '$app/navigation';

	import {
		omProtocol,
		variableOptions,
		domainOptions,
		type DomainMetaData
	} from '@openmeteo/mapbox-layer';

	import * as Sheet from '$lib/components/ui/sheet';

	import Scale from '$lib/components/scale/scale.svelte';
	import HelpDialog from '$lib/components/help/help-dialog.svelte';
	import TimeSelector from '$lib/components/time/time-selector.svelte';
	import VariableSelection from '$lib/components/selection/variable-selection.svelte';

	import {
		TimeButton,
		PartialButton,
		SettingsButton,
		HillshadeButton,
		DarkModeButton,
		ClipWaterButton
	} from '$lib/components/buttons';

	import {
		time,
		sheet,
		loading,
		domain,
		variables,
		modelRun,
		preferences,
		mapBounds,
		paddedBounds
	} from '$lib/stores/preferences';

	import {
		getStyle,
		addPopup,
		checkBounds,
		addOmFileLayer,
		changeOMfileURL,
		getPaddedBounds,
		addHillshadeSources,
		setMapControlSettings,
		urlParamsToPreferences,
		checkClosestDomainInterval
	} from '$lib';

	import '../styles.css';

	let url: URL = $state();
	let map: maplibregl.Map = $state();
	let latest: DomainMetaData | undefined = $state();
	let mapContainer: HTMLElement | null;

	onMount(() => {
		url = new URL(document.location.href);
		urlParamsToPreferences(url);
	});

	onMount(async () => {
		maplibregl.addProtocol('om', (params) => omProtocol(params, undefined, true));

		const style = await getStyle();

		map = new maplibregl.Map({
			container: mapContainer as HTMLElement,
			style: style,
			center: typeof $domain.grid.center == 'object' ? $domain.grid.center : [0, 0],
			zoom: $domain?.grid.zoom,
			keyboard: false,
			hash: true,
			maxZoom: 11,
			maxPitch: 85
		});

		setMapControlSettings(map, url);

		map.on('load', async () => {
			mapBounds.set(map.getBounds());
			paddedBounds.set(map.getBounds());
			getPaddedBounds(map);

			map.addControl(new DarkModeButton(map, url));
			map.addControl(new SettingsButton());
			map.addControl(new PartialButton(map, url, latest));
			map.addControl(new ClipWaterButton(map, url, latest));
			map.addControl(new TimeButton(map, url));
			latest = await getDomainData();

			addOmFileLayer(map);
			addHillshadeSources(map);
			map.addControl(new HillshadeButton(map, url));

			addPopup(map);
		});

		map.on('zoomend', () => {
			checkBounds(map, url, latest);
		});

		map.on('dragend', () => {
			checkBounds(map, url, latest);
		});
	});

	onDestroy(() => {
		if (map) {
			map.remove();
		}
	});

	const getDomainData = async (inProgress = false): Promise<DomainMetaData> => {
		return new Promise((resolve) => {
			fetch(
				`https://map-tiles.open-meteo.com/data_spatial/${$domain.value}/${inProgress ? 'in-progress' : 'latest'}.json`
			).then(async (result) => {
				const json = await result.json();
				if (!inProgress) {
					const referenceTime = json.reference_time;
					$modelRun = new SvelteDate(referenceTime);

					if ($modelRun.getTime() - $time.getTime() > 0) {
						$time = new SvelteDate(referenceTime);
					}
					if (!json.variables.includes($variables[0].value)) {
						$variables = [
							variableOptions.find((v) => v.value === json.variables[0]) ?? variableOptions[0]
						];
						url.searchParams.set('variable', $variables[0].value);
						pushState(url + map._hash.getHashString(), {});
						toast('Variable set to: ' + $variables[0].label);
						changeOMfileURL(map, url, latest);
					}
				}
				resolve(json);
			});
		});
	};

	let latestRequest = $derived(getDomainData());
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
	{latestRequest}
	domainChange={async (value: string): Promise<void> => {
		$domain = domainOptions.find((dm) => dm.value === value) ?? domainOptions[0];
		checkClosestDomainInterval(url);
		url.searchParams.set('domain', $domain.value);
		url.searchParams.set('time', $time.toISOString().replace(/[:Z]/g, '').slice(0, 15));
		pushState(url + map._hash.getHashString(), {});
		toast('Domain set to: ' + $domain.label);
		latest = await getDomainData();
		changeOMfileURL(map, url, latest);
	}}
	variablesChange={(value: string | undefined) => {
		$variables = [variableOptions.find((v) => v.value === value) ?? variableOptions[0]];
		url.searchParams.set('variables', $variables[0].value);
		pushState(url + map._hash.getHashString(), {});
		toast('Variable set to: ' + $variables[0].label);
		changeOMfileURL(map, url, latest);
	}}
/>
<TimeSelector
	bind:time={$time}
	bind:domain={$domain}
	disabled={$loading}
	timeSelector={$preferences.timeSelector}
	onDateChange={(date: Date) => {
		$time = new SvelteDate(date);
		url.searchParams.set('time', $time.toISOString().replace(/[:Z]/g, '').slice(0, 15));
		pushState(url + map._hash.getHashString(), {});
		if ($time.getUTCHours() % $domain.time_interval > 0) {
			toast('Timestep not in interval, maybe force reload page');
		}
		changeOMfileURL(map, url, latest);
	}}
/>
<div class="absolute">
	<Sheet.Root bind:open={$sheet}>
		<Sheet.Content><div class="px-6 pt-12">Units</div></Sheet.Content>
	</Sheet.Root>
</div>
