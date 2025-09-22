<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	import { fade } from 'svelte/transition';

	import { SvelteDate } from 'svelte/reactivity';

	import { toast } from 'svelte-sonner';

	import { mode } from 'mode-watcher';

	import * as maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';

	import { pushState } from '$app/navigation';

	import { omProtocol, getValueFromLatLong } from '../om-protocol';
	import { pad } from '$lib/utils/pad';
	import { domainOptions } from '$lib/utils/domains';
	import { hideZero, variableOptions } from '$lib/utils/variables';

	import type { DomainMetaData } from '$lib/types';

	import * as Sheet from '$lib/components/ui/sheet';
	import * as Drawer from '$lib/components/ui/drawer';

	import Scale from '$lib/components/scale/scale.svelte';
	import TimeSelector from '$lib/components/time/time-selector.svelte';
	import VariableSelection from '$lib/components/selection/variable-selection.svelte';
	import SelectedVariables from '$lib/components/scale/selected-variables.svelte';

	import {
		DarkModeButton,
		DrawerButton,
		HillshadeButton,
		PartialButton,
		SettingsButton,
		TimeButton
	} from '$lib/components/buttons';

	import { getColorScale } from '$lib/utils/color-scales';

	import {
		preferences,
		domain,
		variables,
		sheet,
		drawer,
		time,
		model
	} from '$lib/stores/preferences';

	import { checkClosestHourDomainInterval, urlParamsToPreferences } from '$lib';

	import '../styles.css';

	const darkMode = $derived(mode.current);

	const beforeLayer = 'waterway-tunnel';

	const addHillshadeLayer = () => {
		map.setSky({
			'sky-color': '#000000',
			'sky-horizon-blend': 0.8,
			'horizon-color': '#80C1FF',
			'horizon-fog-blend': 0.6,
			'fog-color': '#D6EAFF',
			'fog-ground-blend': 0
		});

		map.addSource('terrainSource', {
			type: 'raster-dem',
			tiles: ['https://mapproxy.servert.nl/wmts/copernicus/webmercator/{z}/{x}/{y}.png'],
			tileSize: 512,
			// @ts-expect-error scheme not supported in types, but still works
			scheme: 'tms',
			maxzoom: 10
		});

		map.addSource('hillshadeSource', {
			type: 'raster-dem',
			tiles: ['https://mapproxy.servert.nl/wmts/copernicus/webmercator/{z}/{x}/{y}.png'],
			tileSize: 512,
			// @ts-expect-error scheme not supported in types, but still works
			scheme: 'tms',
			maxzoom: 10
		});

		map.addLayer(
			{
				source: 'hillshadeSource',
				id: 'hillshadeLayer',
				type: 'hillshade',
				paint: {
					'hillshade-method': 'igor',
					'hillshade-shadow-color': 'rgba(0,0,0,0.4)',
					'hillshade-highlight-color': 'rgba(255,255,255,0.35)'
				}
			},
			beforeLayer
		);
	};

	const addOmFileLayer = () => {
		map.addSource('omFileRasterSource', {
			url: 'om://' + omUrl,
			type: 'raster',
			tileSize: TILE_SIZE
		});

		omFileSource = map.getSource('omFileRasterSource');
		if (omFileSource) {
			omFileSource.on('error', (e) => {
				checked = 0;
				loading = false;
				clearInterval(checkSourceLoadedInterval);
				toast(e.error.message);
			});
		}

		map.addLayer(
			{
				id: 'omFileRasterLayer',
				type: 'raster',
				source: 'omFileRasterSource'
			},
			beforeLayer
		);
	};

	let omUrl: string;

	let url: URL;

	const now = new SvelteDate();
	now.setHours(now.getHours() + 1, 0, 0, 0);

	const TILE_SIZE = Number(import.meta.env.VITE_TILE_SIZE);

	let checked = 0;
	let checkSourceLoadedInterval: ReturnType<typeof setInterval>;

	let map: maplibregl.Map;
	let mapContainer: HTMLElement | null;
	let popup: maplibregl.Popup | undefined;

	let mapBounds: maplibregl.LngLatBounds | undefined = $state();
	let omFileSource: maplibregl.RasterTileSource | undefined;
	let terrainControl: maplibregl.TerrainControl;

	let latest: DomainMetaData | undefined = $state();
	let loading = $state(false);
	let showPopup = false;

	const changeOMfileURL = () => {
		if (map && omFileSource) {
			loading = true;
			if (popup) {
				popup.remove();
			}
			mapBounds = map.getBounds();

			checkClosestHourModelRun();

			omUrl = getOMUrl();
			omFileSource.setUrl('om://' + omUrl);

			checkSourceLoadedInterval = setInterval(() => {
				checked++;
				if ((omFileSource && omFileSource.loaded()) || checked >= 200) {
					if (checked >= 200) {
						// Timeout after 10s
						toast('Request timed out');
					}
					checked = 0;
					loading = false;
					clearInterval(checkSourceLoadedInterval);
				}
			}, 50);
		}
	};

	onMount(() => {
		url = new URL(document.location.href);
		urlParamsToPreferences(url);
	});

	onMount(async () => {
		maplibregl.addProtocol('om', omProtocol);

		const style = await fetch(
			`https://maptiler.servert.nl/styles/minimal-world-maps${mode.current === 'dark' ? '-dark' : ''}/style.json`
		)
			.then((response) => response.json())
			.then((style) => {
				if ($preferences.globe) {
					return {
						...style,
						projection: {
							type: 'globe'
						}
					};
				} else {
					return style;
				}
			});

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

		map.touchZoomRotate.disableRotation();

		const navigationControl = new maplibregl.NavigationControl({
			visualizePitch: true,
			showZoom: true,
			showCompass: true
		});
		map.addControl(navigationControl);

		let locateControl = new maplibregl.GeolocateControl({
			fitBoundsOptions: {
				maxZoom: 13.5
			},
			positionOptions: {
				enableHighAccuracy: true
			},
			trackUserLocation: true
		});
		map.addControl(locateControl);

		const globeControl = new maplibregl.GlobeControl();
		map.addControl(globeControl);
		globeControl._globeButton.addEventListener('click', () => {
			$preferences.globe = !$preferences.globe;
			if ($preferences.globe) {
				url.searchParams.set('globe', String($preferences.globe));
			} else {
				url.searchParams.delete('globe');
			}
			pushState(url + map._hash.getHashString(), {});
		});

		// improved scrolling
		map.scrollZoom.setZoomRate(1 / 85);
		map.scrollZoom.setWheelZoomRate(1 / 85);

		map.on('load', async () => {
			mapBounds = map.getBounds();

			map.addControl(new DarkModeButton(map, url));
			map.addControl(new SettingsButton());
			map.addControl(new DrawerButton());
			map.addControl(new PartialButton(map, url, changeOMfileURL));
			map.addControl(new TimeButton(map, url));
			map.addControl(new HillshadeButton(map, url));

			if ($preferences.hillshade) {
				addHillshadeLayer();
				if (!terrainControl) {
					terrainControl = new maplibregl.TerrainControl({
						source: 'terrainSource',
						exaggeration: 1
					});
				}
				if ($preferences.terrain) {
					map.setTerrain({ source: 'terrainSource' });
				}

				map.addControl(terrainControl);

				terrainControl._terrainButton.addEventListener('click', () => {
					terrain = !terrain;
					if (terrain) {
						url.searchParams.set('terrain', String(terrain));
					} else {
						url.searchParams.delete('terrain');
					}
					pushState(url + map._hash.getHashString(), {});
				});
			}

			latest = await getDomainData();
			omUrl = getOMUrl();

			addOmFileLayer();

			map.on('mousemove', function (e) {
				if (showPopup) {
					const coordinates = e.lngLat;
					if (!popup) {
						popup = new maplibregl.Popup()
							.setLngLat(coordinates)
							.setHTML(`<span class="value-popup">Outside domain</span>`)
							.addTo(map);
					} else {
						popup.addTo(map);
					}
					let { index, value } = getValueFromLatLong(coordinates.lat, coordinates.lng, colorScale);
					if (index) {
						if ((hideZero.includes($variables[0].value) && value <= 0.25) || !value) {
							popup.remove();
						} else {
							let string = value.toFixed(1) + colorScale.unit;
							popup.setLngLat(coordinates).setHTML(`<span class="value-popup">${string}</span>`);
						}
					} else {
						popup.setLngLat(coordinates).setHTML(`<span class="value-popup">Outside domain</span>`);
					}
				}
			});

			map.on('click', (e) => {
				showPopup = !showPopup;
				if (!showPopup && popup) {
					popup.remove();
				}
				if (showPopup && popup) {
					const coordinates = e.lngLat;
					popup.setLngLat(coordinates).addTo(map);
				}
			});
		});
	});

	onDestroy(() => {
		if (map) {
			map.remove();
		}
	});

	const getOMUrl = () => {
		if (mapBounds) {
			return `https://map-tiles.open-meteo.com/data_spatial/${$domain.value}/${$model.getUTCFullYear()}/${pad($model.getUTCMonth() + 1)}/${pad($model.getUTCDate())}/${pad($model.getUTCHours())}00Z/${$time.getUTCFullYear()}-${pad($time.getUTCMonth() + 1)}-${pad($time.getUTCDate())}T${pad($time.getUTCHours())}00.om?dark=${darkMode}&variable=${$variables[0].value}&bounds=${mapBounds.getSouth()},${mapBounds.getWest()},${mapBounds.getNorth()},${mapBounds.getEast()}&partial=${$preferences.partial}`;
		} else {
			return `https://map-tiles.open-meteo.com/data_spatial/${$domain.value}/${$model.getUTCFullYear()}/${pad($model.getUTCMonth() + 1)}/${pad($model.getUTCDate())}/${pad($model.getUTCHours())}00Z/${$time.getUTCFullYear()}-${pad($time.getUTCMonth() + 1)}-${pad($time.getUTCDate())}T${pad($time.getUTCHours())}00.om?dark=${darkMode}&variable=${$variables[0].value}&partial=${$preferences.partial}`;
		}
	};

	let colorScale = $derived.by(() => {
		return getColorScale($variables[0]);
	});

	const getDomainData = async (latest = true): Promise<DomainMetaData> => {
		return new Promise((resolve) => {
			fetch(
				`https://map-tiles.open-meteo.com/data_spatial/${$domain.value}/${latest ? 'latest' : 'in-progress'}.json`
			).then(async (result) => {
				const json = await result.json();
				if (latest) {
					const referenceTime = json.reference_time;
					$model = new SvelteDate(referenceTime);

					if ($model.getTime() - $time.getTime() > 0) {
						$time = new SvelteDate(referenceTime);
					}
					if (!json.variables.includes($variables[0].value)) {
						$variables = [
							variableOptions.find((v) => v.value === json.variables[0]) ?? variableOptions[0]
						];
						url.searchParams.set('variable', $variables[0].value);
						pushState(url + map._hash.getHashString(), {});
						toast('Variable set to: ' + $variables[0].label);
						changeOMfileURL();
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

	const checkClosestHourModelRun = () => {
		let modelRunChanged = false;
		const referenceTime = new Date(latest ? latest.reference_time : now);

		const year = $time.getUTCFullYear();
		const month = $time.getUTCMonth();
		const date = $time.getUTCDate();

		const closestModelRunUTCHour =
			$time.getUTCHours() - ($time.getUTCHours() % $domain.model_interval);

		const closestModelRun = new SvelteDate();
		closestModelRun.setUTCFullYear(year);
		closestModelRun.setUTCMonth(month);
		closestModelRun.setUTCDate(date);
		closestModelRun.setUTCHours(closestModelRunUTCHour);
		closestModelRun.setUTCMinutes(0);
		closestModelRun.setUTCSeconds(0);
		closestModelRun.setUTCMilliseconds(0);

		if ($time.getTime() < $model.getTime()) {
			$model = new SvelteDate(closestModelRun);
			modelRunChanged = true;
		} else {
			if (referenceTime.getTime() === $model.getTime()) {
				url.searchParams.delete('model_run');
				pushState(url + map._hash.getHashString(), {});
			} else if (
				$time.getTime() > referenceTime.getTime() &&
				referenceTime.getTime() > $model.getTime()
			) {
				$model = new SvelteDate(referenceTime);
				modelRunChanged = true;
			} else if ($time.getTime() < referenceTime.getTime() - 24 * 60 * 60 * 1000) {
				// Atleast yesterday, always update to nearest modelRun
				if ($model.getTime() < closestModelRun.getTime()) {
					$model = new SvelteDate(closestModelRun);
					modelRunChanged = true;
				}
			}
		}

		if (modelRunChanged) {
			url.searchParams.set('model_run', $model.toISOString().replace(/[:Z]/g, '').slice(0, 15));
			pushState(url + map._hash.getHashString(), {});
			toast(
				'Model run set to: ' +
					$model.getUTCFullYear() +
					'-' +
					pad($model.getUTCMonth() + 1) +
					'-' +
					pad($model.getUTCDate()) +
					' ' +
					pad($model.getUTCHours()) +
					':' +
					pad($model.getUTCMinutes())
			);
		}
		// day the data structure was altered
		if ($model.getTime() < 1752624000000) {
			toast('Date selected probably too old, since data structure altered on 16th July 2025');
		}
	};
</script>

<svelte:head>
	<title>Open-Meteo Maps</title>
</svelte:head>

{#if loading}
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
	onDateChange={(date: Date) => {
		$time = new SvelteDate(date);

		url.searchParams.set('time', $time.toISOString().replace(/[:Z]/g, '').slice(0, 15));
		pushState(url + map._hash.getHashString(), {});

		if ($time.getUTCHours() % $domain.time_interval > 0) {
			toast('Timestep not in interval, maybe force reload page');
		}

		changeOMfileURL();
	}}
	disabled={loading}
	timeSelector={$preferences.timeSelector}
/>
<div class="absolute">
	<Sheet.Root bind:open={$sheet}>
		<Sheet.Content><div class="px-6 pt-12">Units</div></Sheet.Content>
	</Sheet.Root>

	<Drawer.Root bind:open={$drawer}>
		<Drawer.Content class="h-1/3">
			<div class="flex flex-col items-center overflow-y-scroll pb-12">
				<div class="container mx-auto px-3">
					<VariableSelection
						time={$time}
						model={$model}
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
							changeOMfileURL();
						}}
						modelRunChange={(mr: Date) => {
							$model = mr;
							url.searchParams.set(
								'model_run',
								$model.toISOString().replace(/[:Z]/g, '').slice(0, 15)
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
							changeOMfileURL();
						}}
						variablesChange={(value: string) => {
							$variables = [variableOptions.find((v) => v.value === value) ?? variableOptions[0]];
							url.searchParams.set('variables', $variables[0].value);
							pushState(url + map._hash.getHashString(), {});
							toast('Variable set to: ' + $variables[0].label);
							changeOMfileURL();
						}}
					/>
				</div>
			</div>
		</Drawer.Content>
	</Drawer.Root>
</div>
