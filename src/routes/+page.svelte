<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	import { fade } from 'svelte/transition';

	import { SvelteDate } from 'svelte/reactivity';

	import { toast } from 'svelte-sonner';

	import * as maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';

	import { pushState } from '$app/navigation';

	import { omProtocol } from '../om-protocol';

	import { pad } from '$lib/utils/pad';
	import { domainOptions } from '$lib/utils/domains';
	import { variableOptions } from '$lib/utils/variables';

	import type { DomainMetaData } from '$lib/types';

	import * as Sheet from '$lib/components/ui/sheet';

	import { Drawer } from 'vaul-svelte';

	import Scale from '$lib/components/scale/scale.svelte';
	import TimeSelector from '$lib/components/time/time-selector.svelte';
	import VariableSelection from '$lib/components/selection/variable-selection.svelte';
	import SelectedVariables from '$lib/components/scale/selected-variables.svelte';

	import {
		TimeButton,
		PartialButton,
		DrawerButton,
		SettingsButton,
		HillshadeButton,
		DarkModeButton
	} from '$lib/components/buttons';

	import {
		time,
		sheet,
		drawer,
		loading,
		domain,
		variables,
		modelRun,
		preferences,
		mapBounds,
		drawerHeight
	} from '$lib/stores/preferences';

	import {
		getStyle,
		addPopup,
		addOmFileLayer,
		changeOMfileURL,
		setMapControlSettings,
		urlParamsToPreferences,
		checkClosestHourDomainInterval,
		addHillshadeSources
	} from '$lib';

	import '../styles.css';

	let url: URL;
	let map: maplibregl.Map;
	let latest: DomainMetaData | undefined = $state();
	let mapContainer: HTMLElement | null;

	onMount(() => {
		url = new URL(document.location.href);
		urlParamsToPreferences(url);
	});

	onMount(async () => {
		maplibregl.addProtocol('om', omProtocol);

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

			map.addControl(new DarkModeButton(map, url));
			map.addControl(new SettingsButton());
			map.addControl(new DrawerButton());
			map.addControl(new PartialButton(map, url, latest));
			map.addControl(new TimeButton(map, url));
			latest = await getDomainData();

			addOmFileLayer(map);
			addHillshadeSources(map);
			map.addControl(new HillshadeButton(map, url));

			addPopup(map);
		});
	});

	onDestroy(() => {
		if (map) {
			map.remove();
		}
	});

	const getDomainData = async (latest = true): Promise<DomainMetaData> => {
		return new Promise((resolve) => {
			fetch(
				`https://map-tiles.open-meteo.com/data_spatial/${$domain.value}/${latest ? 'latest' : 'in-progress'}.json`
			).then(async (result) => {
				const json = await result.json();
				if (latest) {
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
	let progressRequest = $derived(getDomainData(false));

	let modelRuns = $derived.by(() => {
		if (latest) {
			let referenceTime = new Date(latest.reference_time);
			let returnArray = [
				...Array(Math.round(referenceTime.getUTCHours() / $domain.model_interval + 1))
			].map((_, i) => {
				let d = new SvelteDate();
				d.setUTCHours(i * $domain.model_interval, 0, 0, 0);
				return d;
			});
			return returnArray;
		} else {
			return [];
		}
	});

	let activeSnapPoint = $derived($drawerHeight);
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
<div class="absolute bottom-1 left-1 max-h-[300px]">
	<Scale showScale={$preferences.showScale} variables={$variables} />
	<SelectedVariables domain={$domain} variables={$variables} />
</div>
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

	<Drawer.Root
		bind:open={$drawer}
		bind:activeSnapPoint
		direction="bottom"
		snapPoints={[0.3, 0.4, 0.5, 0.6, 0.7]}
		onActiveSnapPointChange={(e: string | number | null) => {
			drawerHeight.set(e as number);
			return e;
		}}
	>
		<Drawer.Overlay class="fixed inset-0 bg-black/40" />
		<Drawer.Portal>
			<Drawer.Content
				class="border-b-none fixed right-0 bottom-0 left-0 mx-[-1px] flex h-full max-h-[97%] flex-col rounded-t-[10px] border border-gray-200 bg-white"
			>
				<div class="flex flex-col items-center overflow-y-scroll pb-12">
					<div class="container mx-auto px-3">
						<VariableSelection
							time={$time}
							model={$modelRun}
							domain={$domain}
							variables={$variables}
							{modelRuns}
							{latestRequest}
							{progressRequest}
							domainChange={async (value: string): Promise<void> => {
								$domain = domainOptions.find((dm) => dm.value === value) ?? domainOptions[0];
								checkClosestHourDomainInterval(url);
								url.searchParams.set('domain', $domain.value);
								url.searchParams.set('time', $time.toISOString().replace(/[:Z]/g, '').slice(0, 15));
								pushState(url + map._hash.getHashString(), {});
								toast('Domain set to: ' + $domain.label);
								latest = await getDomainData();
								changeOMfileURL(map, url, latest);
							}}
							modelRunChange={(mr: Date) => {
								$modelRun = mr;
								url.searchParams.set(
									'model-run',
									$modelRun.toISOString().replace(/[:Z]/g, '').slice(0, 15)
								);
								pushState(url + map._hash.getHashString(), {});
								toast(
									'Model run set to: ' +
										mr.getUTCFullYear() +
										'-' +
										pad(mr.getUTCMonth() + 1) +
										'-' +
										pad(mr.getUTCDate()) +
										' ' +
										pad(mr.getUTCHours()) +
										':' +
										pad(mr.getUTCMinutes())
								);
								changeOMfileURL(map, url, latest);
							}}
							variablesChange={(value: string) => {
								$variables = [variableOptions.find((v) => v.value === value) ?? variableOptions[0]];
								url.searchParams.set('variables', $variables[0].value);
								pushState(url + map._hash.getHashString(), {});
								toast('Variable set to: ' + $variables[0].label);
								changeOMfileURL(map, url, latest);
							}}
						/>
					</div>
				</div>
			</Drawer.Content>
		</Drawer.Portal>
	</Drawer.Root>
</div>
