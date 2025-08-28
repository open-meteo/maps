<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	import { fade } from 'svelte/transition';

	import { pushState } from '$app/navigation';

	import { setMode, mode } from 'mode-watcher';

	import { toast } from 'svelte-sonner';

	import * as maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';

	import { omProtocol, getValueFromLatLong } from '../om-protocol';
	import { pad } from '$lib/utils/pad';
	import { domains } from '$lib/utils/domains';
	import { hideZero, variables } from '$lib/utils/variables';
	import { createTimeSlider } from '$lib/components/time-slider';

	import type { Variable, Domain } from '$lib/types';

	import * as Sheet from '$lib/components/ui/sheet';
	import * as Drawer from '$lib/components/ui/drawer';

	import { getColorScale } from '$lib/utils/color-scales';

	let partial = $state(false);
	let showScale = $state(true);
	let sheetOpen = $state(false);
	let drawerOpen = $state(false);
	let showTimeSelector = $state(true);

	import '../styles.css';
	import Scale from '$lib/components/scale/scale.svelte';
	import SelectedVariables from '$lib/components/scale/selected-variables.svelte';
	import VariableSelection from '$lib/components/selection/variable-selection.svelte';

	let darkMode = $derived(mode.current);
	let timeSliderApi: { setDisabled: (d: boolean) => void };
	let timeSliderContainer: HTMLElement;

	class SettingsButton {
		onAdd() {
			const div = document.createElement('div');
			div.title = 'Settings';
			div.className = 'maplibregl-ctrl maplibregl-ctrl-group';
			div.innerHTML = `<button style="display:flex;justify-content:center;align-items:center;">
				<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings-icon lucide-settings"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>`;
			div.addEventListener('contextmenu', (e) => e.preventDefault());
			div.addEventListener('click', () => {
				sheetOpen = !sheetOpen;
			});

			return div;
		}
		onRemove() {}
	}
	class VariableButton {
		onAdd() {
			const div = document.createElement('div');
			div.title = 'Variables';
			div.className = 'maplibregl-ctrl maplibregl-ctrl-group';
			div.innerHTML = `<button style="display:flex;justify-content:center;align-items:center;">
				<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" stroke-width="1.2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"  stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-images-icon lucide-images"><path d="M18 22H4a2 2 0 0 1-2-2V6"/><path d="m22 13-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 18"/><circle cx="12" cy="8" r="2"/><rect width="16" height="16" x="6" y="2" rx="2"/></svg>
        </button>`;
			div.addEventListener('contextmenu', (e) => e.preventDefault());
			div.addEventListener('click', () => {
				drawerOpen = !drawerOpen;
			});

			return div;
		}
		onRemove() {}
	}
	class DarkModeButton {
		onAdd() {
			const div = document.createElement('div');
			div.title = 'Darkmode';

			div.className = 'maplibregl-ctrl maplibregl-ctrl-group';

			const darkSVG = `<button style="display:flex;justify-content:center;align-items:center;">
		<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" stroke-width="1.2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sun-icon lucide-sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
             </button>`;

			const lightSVG = `<button style="display:flex;justify-content:center;align-items:center;">
		<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" stroke-width="1.2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon-icon lucide-moon"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
        </button>`;
			div.innerHTML = mode.current !== 'dark' ? lightSVG : darkSVG;
			div.addEventListener('contextmenu', (e) => e.preventDefault());
			div.addEventListener('click', () => {
				if (mode.current === 'light') {
					setMode('dark');
				} else {
					setMode('light');
				}
				div.innerHTML = mode.current !== 'dark' ? lightSVG : darkSVG;
				map.setStyle(
					`https://maptiler.servert.nl/styles/basic-world-maps${mode.current === 'dark' ? '-dark' : ''}/style.json`
				);
				setTimeout(() => changeOMfileURL(), 500);
			});
			return div;
		}
		onRemove() {}
	}

	class PartialButton {
		onAdd() {
			const div = document.createElement('div');
			div.className = 'maplibregl-ctrl maplibregl-ctrl-group';
			div.title = 'Partial requests';

			const partialSVG = `<button style="display:flex;justify-content:center;align-items:center;">
				<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" stroke-width="1.2" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-database-zap-icon lucide-database-zap"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 15 21.84"/><path d="M21 5V8"/><path d="M21 12L18 17H22L19 22"/><path d="M3 12A9 3 0 0 0 14.59 14.87"/></svg>
             </button>`;

			const fullSVG = `<button style="display:flex;justify-content:center;align-items:center;">
				<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" stroke-width="1.2" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-database-icon lucide-database"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>
        </button>`;
			div.innerHTML = partial ? partialSVG : fullSVG;
			div.addEventListener('contextmenu', (e) => e.preventDefault());
			div.addEventListener('click', () => {
				partial = !partial;
				div.innerHTML = partial ? partialSVG : fullSVG;
				if (partial) {
					url.searchParams.set('partial', String(partial));
				} else {
					url.searchParams.delete('partial');
				}
				pushState(url + map._hash.getHashString(), {});
				setTimeout(() => changeOMfileURL(), 500);
			});
			return div;
		}
		onRemove() {}
	}

	class TimeButton {
		onAdd() {
			const div = document.createElement('div');
			div.className = 'maplibregl-ctrl maplibregl-ctrl-group';
			div.title = 'Time selector';

			const clockSVG = `<button style="display:flex;justify-content:center;align-items:center;">
				<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" stroke-width="1.2"  width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"  stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-clock-icon lucide-calendar-clock"><path d="M16 14v2.2l1.6 1"/><path d="M16 2v4"/><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M3 10h5"/><path d="M8 2v4"/><circle cx="16" cy="16" r="6"/></svg>
			 </button>`;
			const calendarSVG = `<button style="display:flex;justify-content:center;align-items:center;">
				<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" stroke-width="1.2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"  stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-off-icon lucide-calendar-off"><path d="M4.2 4.2A2 2 0 0 0 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 1.82-1.18"/><path d="M21 15.5V6a2 2 0 0 0-2-2H9.5"/><path d="M16 2v4"/><path d="M3 10h7"/><path d="M21 10h-5.5"/><path d="m2 2 20 20"/></svg>
			</button>`;

			div.innerHTML = clockSVG;
			div.addEventListener('contextmenu', (e) => e.preventDefault());
			div.addEventListener('click', () => {
				showTimeSelector = !showTimeSelector;
				div.innerHTML = showTimeSelector ? clockSVG : calendarSVG;
			});
			return div;
		}
		onRemove() {}
	}

	let map: maplibregl.Map;
	let mapContainer: HTMLElement | null;

	let omUrl: string;
	let popup: maplibregl.Popup | undefined;

	let url: URL;
	let params: URLSearchParams;

	let domain: Domain = $state({
		value: 'meteoswiss_icon_ch1',
		label: 'DWD ICON D2',
		model_interval: 3
	});
	let variable: Variable = $state({ value: 'temperature_2m', label: 'Temperature 2m' });
	let timeSelected = $state(new Date());
	let modelRunSelected = $state(new Date());
	let mapBounds: maplibregl.LngLatBounds = $state();

	const TILE_SIZE = Number(import.meta.env.VITE_TILE_SIZE);

	let source: maplibregl.Map;

	let checkSourceLoadedInterval: ReturnType<typeof setInterval>;
	let checked = 0;

	let loading = $state(false);
	let omFileSource: maplibregl.RasterTileSource | undefined;

	const changeOMfileURL = () => {
		if (map) {
			loading = true;
			if (popup) {
				popup.remove();
			}

			mapBounds = map.getBounds();
			timeSliderApi.setDisabled(true);

			omUrl = getOMUrl();
			// if (map.getLayer('omFileLayer')) {
			// 	map.removeLayer('omFileLayer');
			// }

			omFileSource = map.getSource('omFileSource');
			if (omFileSource) {
				omFileSource.setUrl('om://' + omUrl);
			}

			// source = map.addSource('omFileSource', {
			// 	type: 'raster',
			// 	url: 'om://' + omUrl,
			// 	tileSize: TILE_SIZE,
			// 	volatile: import.meta.env.DEV
			// });

			// map.addLayer(
			// 	{
			// 		source: 'omFileSource',
			// 		id: 'omFileLayer',
			// 		type: 'raster'
			// 	},
			// 	'waterway-tunnel'
			// );
			checkSourceLoadedInterval = setInterval(() => {
				checked++;
				if (source.loaded() || checked >= 30) {
					checked = 0;
					timeSliderApi.setDisabled(false);
					loading = false;
					clearInterval(checkSourceLoadedInterval);
				}
			}, 100);
		}
	};

	let latest = $state();

	onMount(() => {
		url = new URL(document.location.href);
		params = new URLSearchParams(url.search);

		if (params.get('domain')) {
			domain = domains.find((dm) => dm.value === params.get('domain')) ?? domains[0];
		} else {
			domain = domains.find((dm) => dm.value === import.meta.env.VITE_DOMAIN) ?? domains[0];
		}

		let urlModelTime = params.get('model');
		if (urlModelTime && urlModelTime.length == 15) {
			const year = parseInt(urlModelTime.slice(0, 4));
			const month = parseInt(urlModelTime.slice(5, 7)) - 1; // zero-based
			const day = parseInt(urlModelTime.slice(8, 10));
			const hour = parseInt(urlModelTime.slice(11, 13));
			const minute = parseInt(urlModelTime.slice(13, 15));
			// Parse Date from UTC components (urlTime is in UTC)
			modelRunSelected = new Date(Date.UTC(year, month, day, hour, minute, 0, 0));
		} else {
			modelRunSelected.setHours(0, 0, 0, 0); // Default to 12:00 local time
		}

		let urlTime = params.get('time');
		if (urlTime && urlTime.length == 15) {
			const year = parseInt(urlTime.slice(0, 4));
			const month = parseInt(urlTime.slice(5, 7)) - 1; // zero-based
			const day = parseInt(urlTime.slice(8, 10));
			const hour = parseInt(urlTime.slice(11, 13));
			const minute = parseInt(urlTime.slice(13, 15));
			// Parse Date from UTC components (urlTime is in UTC)
			timeSelected = new Date(Date.UTC(year, month, day, hour, minute, 0, 0));
		} else {
			timeSelected.setHours(12, 0, 0, 0); // Default to 12:00 local time
		}

		if (params.get('variable')) {
			variable = variables.find((v) => v.value === params.get('variable')) ?? variables[0];
		} else {
			variable = variables.find((v) => v.value === import.meta.env.VITE_VARIABLE) ?? variables[0];
		}

		if (params.get('partial')) {
			partial = params.get('partial') === 'true';
		}
	});

	let showPopup = false;
	onMount(() => {
		maplibregl.addProtocol('om', omProtocol);

		map = new maplibregl.Map({
			container: mapContainer as HTMLElement,
			style: `https://maptiler.servert.nl/styles/basic-world-maps${mode.current === 'dark' ? '-dark' : ''}/style.json`,
			center: typeof domain.grid.center == 'object' ? domain.grid.center : [0, 0],
			zoom: domain?.grid.zoom,
			keyboard: false,
			hash: true,
			maxZoom: 20,
			maxPitch: 85
		});

		map.touchZoomRotate.disableRotation();

		// Add zoom and rotation controls to the map.
		map.addControl(
			new maplibregl.NavigationControl({
				visualizePitch: true,
				showZoom: true,
				showCompass: true
			})
		);

		// Add geolocate control to the map.
		map.addControl(
			new maplibregl.GeolocateControl({
				fitBoundsOptions: {
					maxZoom: 13.5
				},
				positionOptions: {
					enableHighAccuracy: true
				},
				trackUserLocation: true
			})
		);

		map.addControl(new maplibregl.GlobeControl());

		// improved scrolling
		map.scrollZoom.setZoomRate(1 / 85);
		map.scrollZoom.setWheelZoomRate(1 / 85);

		map.on('load', async () => {
			mapBounds = map.getBounds();
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
				scheme: 'tms',
				maxzoom: 10
			});

			map.addSource('hillshadeSource', {
				type: 'raster-dem',
				tiles: ['https://mapproxy.servert.nl/wmts/copernicus/webmercator/{z}/{x}/{y}.png'],
				tileSize: 512,
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
						//'hillshade-exaggeration': 1,
						'hillshade-shadow-color': 'rgba(0,0,0,0.4)',
						'hillshade-highlight-color': 'rgba(255,255,255,0.35)'
					}
				},
				'waterway-tunnel'
			);

			map.addControl(
				new maplibregl.TerrainControl({
					source: 'terrainSource',
					exaggeration: 1
				})
			);

			map.addControl(new SettingsButton());
			map.addControl(new VariableButton());
			map.addControl(new DarkModeButton());
			map.addControl(new PartialButton());
			map.addControl(new TimeButton());

			latest = await getDomainData();
			omUrl = getOMUrl();
			source = map.addSource('omFileSource', {
				type: 'raster',
				url: 'om://' + omUrl,
				tileSize: TILE_SIZE,
				volatile: import.meta.env.DEV
			});

			map.addLayer(
				{
					source: 'omFileSource',
					id: 'omFileLayer',
					type: 'raster'
				},
				'waterway-tunnel'
			);

			map.on('mousemove', function (e) {
				if (showPopup) {
					const coordinates = e.lngLat;
					if (!popup) {
						popup = new maplibregl.Popup()
							.setLngLat(coordinates)
							.setHTML(`<span style="color:black;">Outside domain</span>`)
							.addTo(map);
					} else {
						popup.addTo(map);
					}
					let { index, value } = getValueFromLatLong(coordinates.lat, coordinates.lng, colorScale);
					if (index) {
						if ((hideZero.includes(variable.value) && value <= 0.25) || !value) {
							popup.remove();
						} else {
							let string = '';
							if (variable.value.startsWith('wind_')) {
								string = `${value.toFixed(0)}kn`;
							} else {
								string = value.toFixed(1) + (variable.value.startsWith('temperature') ? 'C°' : '');
							}

							popup.setLngLat(coordinates).setHTML(`<span style="color:black;">${string}</span>`);
						}
					} else {
						popup
							.setLngLat(coordinates)
							.setHTML(`<span style="color:black;">Outside domain</span>`);
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

			timeSliderApi = createTimeSlider({
				container: timeSliderContainer,
				initialDate: timeSelected,
				onChange: (newDate) => {
					timeSelected = newDate;
					url.searchParams.set('time', newDate.toISOString().replace(/[:Z]/g, '').slice(0, 15));
					history.pushState({}, '', url);
					changeOMfileURL();
				},
				resolution: domain.time_interval
			});
		});
	});
	onDestroy(() => {
		if (map) {
			map.remove();
		}
		if (timeSliderContainer) {
			timeSliderContainer.innerHTML = ``;
		}
	});

	const getOMUrl = () => {
		return `https://map-tiles.open-meteo.com/data_spatial/${domain.value}/${modelRunSelected.getUTCFullYear()}/${pad(modelRunSelected.getUTCMonth() + 1)}/${pad(modelRunSelected.getUTCDate())}/${pad(modelRunSelected.getUTCHours())}00Z/${timeSelected.getUTCFullYear()}-${pad(timeSelected.getUTCMonth() + 1)}-${pad(timeSelected.getUTCDate())}T${pad(timeSelected.getUTCHours())}00.om?dark=${darkMode}&variable=${variable.value}&bounds=${mapBounds.getSouth()},${mapBounds.getWest()},${mapBounds.getNorth()},${mapBounds.getEast()}&partial=${partial}`;
	};

	let colorScale = $derived.by(() => {
		return getColorScale(variable);
	});

	const getDomainData = async (latest = true) => {
		return new Promise((resolve) => {
			fetch(
				`https://map-tiles.open-meteo.com/data_spatial/${domain.value}/${latest ? 'latest' : 'in-progress'}.json`
			).then(async (result) => {
				const json = await result.json();
				if (latest) {
					const referenceTime = json.reference_time;
					modelRunSelected = new Date(referenceTime);

					if (modelRunSelected - timeSelected > 0) {
						timeSelected = new Date(referenceTime);
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
				...Array(Math.round(referenceTime.getUTCHours() / domain.model_interval + 1))
			].map((_, i) => {
				let d = new Date();
				d.setUTCHours(i * domain.model_interval, 0, 0, 0);
				return d;
			});
			return returnArray;
		} else {
			return [];
		}
	});
</script>

<svelte:head>
	<title>Open-Meteo Maps</title>
</svelte:head>

{#if loading}
	<div
		in:fade={{ delay: 0.2, duration: 200 }}
		out:fade={{ delay: 0, duration: 100 }}
		class="transform-[translate(-50%, -50%)] absolute top-[50%] left-[50%] z-50"
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
	<Scale {showScale} {variable} />
	<SelectedVariables {domain} {variable} />
</div>
<div
	class="bg-background/50 absolute bottom-14.5 left-[50%] mx-auto transform-[translate(-50%)] rounded-lg px-4 py-4 {!showTimeSelector
		? 'pointer-events-none opacity-0'
		: 'opacity-100'}"
>
	<div
		bind:this={timeSliderContainer}
		class="time-slider-container flex flex-col items-center gap-0"
	></div>
</div>
<div class="absolute">
	<Sheet.Root bind:open={sheetOpen}>
		<Sheet.Content><div class="px-6 pt-12">Units</div></Sheet.Content>
	</Sheet.Root>

	<Drawer.Root bind:open={drawerOpen}>
		<Drawer.Content class="h-1/3">
			<div class="flex flex-col items-center overflow-y-scroll pb-12">
				<div class="container mx-auto px-3">
					<VariableSelection
						{domain}
						{variable}
						{modelRuns}
						{timeSelected}
						{latestRequest}
						{progressRequest}
						{modelRunSelected}
						domainChange={(value: string) => {
							domain = domains.find((dm) => dm.value === value) ?? domains[0];
							url.searchParams.set('domain', value);
							pushState(url + map._hash.getHashString(), {});
							toast('Domain set to: ' + domain.label);
							changeOMfileURL();
						}}
						modelRunChange={(mr: Date) => {
							modelRunSelected = mr;
							url.searchParams.set('model', mr.toISOString().replace(/[:Z]/g, '').slice(0, 15));
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
						variableChange={(value: string) => {
							variable = variables.find((v) => v.value === value) ?? variables[0];
							url.searchParams.set('variable', variable.value);
							pushState(url + map._hash.getHashString(), {});
							toast('Variable set to: ' + variable.label);
							changeOMfileURL();
						}}
					/>
				</div>
			</div>
		</Drawer.Content>
	</Drawer.Root>
</div>
