<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	import { fade } from 'svelte/transition';

	import { SvelteDate } from 'svelte/reactivity';

	import { toast } from 'svelte-sonner';

	import { setMode, mode } from 'mode-watcher';

	import * as maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';

	import { pushState } from '$app/navigation';

	import { omProtocol, getValueFromLatLong } from '../om-protocol';
	import { pad } from '$lib/utils/pad';
	import { domains } from '$lib/utils/domains';
	import { hideZero, variables } from '$lib/utils/variables';

	import type { Variable, Domain, DomainMetaData } from '$lib/types';

	import * as Sheet from '$lib/components/ui/sheet';
	import * as Drawer from '$lib/components/ui/drawer';

	import Scale from '$lib/components/scale/scale.svelte';
	import TimeSelector from '$lib/components/time/time-selector.svelte';
	import VariableSelection from '$lib/components/selection/variable-selection.svelte';
	import SelectedVariables from '$lib/components/scale/selected-variables.svelte';

	import { getColorScale } from '$lib/utils/color-scales';

	import '../styles.css';

	let partial = $state(false);
	let showScale = $state(true);
	let sheetOpen = $state(false);
	let drawerOpen = $state(false);
	let showTimeSelector = $state(true);

	let darkMode = $derived(mode.current);

	const beforeLayer = 'country-lines';

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

		omRasterSource = map.getSource('omFileRasterSource');
		if (omRasterSource) {
			omRasterSource.on('error', (e) => {
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
				source: 'omFileRasterSource',
				paint: {
					// 'raster-fade-duration': 300
				}
			},
			beforeLayer
		);

		map.addSource('omFileVectorSource', {
			url: 'om://' + omUrl,
			type: 'vector'
		});

		omVectorSource = map.getSource('omFileVectorSource');
		if (omVectorSource) {
			omVectorSource.on('error', (e) => {
				checked = 0;
				loading = false;
				clearInterval(checkSourceLoadedInterval);
				toast(e.error.message);
			});
		}

		map.addLayer({
			id: 'omFileVectorLayer',
			type: 'line',
			source: 'omFileVectorSource',
			'source-layer': 'contours',
			paint: {
				'line-color': 'blue',
				'line-width': 2
			}
		});
	};

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
				<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" stroke-width="1.2"  width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-variable-icon lucide-variable"><path d="M8 21s-4-3-4-9 4-9 4-9"/><path d="M16 3s4 3 4 9-4 9-4 9"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>
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
		<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" stroke-width="1.2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sun-icon lucide-sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
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
					`https://maptiler.servert.nl/styles/maps-minimal${mode.current === 'dark' ? '-dark' : ''}/style.json`
				);

				map.once('styledata', () => {
					setTimeout(() => {
						// addHillshadeLayer();
						addOmFileLayer();
					}, 50);
				});
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

	let omUrl: string;

	let url: URL;
	let params: URLSearchParams;

	let domain: Domain = $state(
		domains.find((dm) => dm.value === import.meta.env.VITE_DOMAIN) ?? domains[0]
	);
	let variable: Variable = $state(
		variables.find((v) => v.value === import.meta.env.VITE_VARIABLE) ?? variables[0]
	);

	const now = new SvelteDate();
	now.setHours(now.getHours() + 1, 0, 0, 0);
	let timeSelected = $state(new Date(now)); // Default to current hour + 1
	let modelRunSelected = $state(new Date());

	const TILE_SIZE = Number(import.meta.env.VITE_TILE_SIZE);

	let checked = 0;
	let checkSourceLoadedInterval: ReturnType<typeof setInterval>;

	let map: maplibregl.Map;
	let mapContainer: HTMLElement | null;
	let popup: maplibregl.Popup | undefined;

	let mapBounds: maplibregl.LngLatBounds | undefined = $state();
	let omRasterSource: maplibregl.RasterTileSource | undefined;
	let omVectorSource: maplibregl.VectorTileSource | undefined;

	let latest: DomainMetaData | undefined = $state();
	let loading = $state(false);
	let showPopup = false;

	const changeOMfileURL = () => {
		if (map && omRasterSource && omVectorSource) {
			loading = true;
			if (popup) {
				popup.remove();
			}
			mapBounds = map.getBounds();

			checkClosestHourModelRun();

			omUrl = getOMUrl();
			omRasterSource.setUrl('om://' + omUrl);
			omVectorSource.setUrl('om://' + omUrl);

			checkSourceLoadedInterval = setInterval(() => {
				checked++;
				if ((omRasterSource && omRasterSource.loaded()) || checked >= 200) {
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
		params = new URLSearchParams(url.search);

		if (params.get('domain')) {
			domain = domains.find((dm) => dm.value === params.get('domain')) ?? domains[0];
		}

		let urlModelTime = params.get('model_run');
		if (urlModelTime && urlModelTime.length == 15) {
			const year = parseInt(urlModelTime.slice(0, 4));
			const month = parseInt(urlModelTime.slice(5, 7)) - 1;
			const day = parseInt(urlModelTime.slice(8, 10));
			const hour = parseInt(urlModelTime.slice(11, 13));
			const minute = parseInt(urlModelTime.slice(13, 15));
			// Parse Date from UTC components (urlTime is in UTC)
			modelRunSelected = new SvelteDate(Date.UTC(year, month, day, hour, minute, 0, 0));
		} else {
			modelRunSelected.setHours(0, 0, 0, 0);
		}

		let urlTime = params.get('time');
		if (urlTime && urlTime.length == 15) {
			const year = parseInt(urlTime.slice(0, 4));
			const month = parseInt(urlTime.slice(5, 7)) - 1;
			const day = parseInt(urlTime.slice(8, 10));
			const hour = parseInt(urlTime.slice(11, 13));
			const minute = parseInt(urlTime.slice(13, 15));
			// Parse Date from UTC components (urlTime is in UTC)
			timeSelected = new SvelteDate(Date.UTC(year, month, day, hour, minute, 0, 0));
		}
		checkClosestHourDomainInterval();

		if (params.get('variable')) {
			variable = variables.find((v) => v.value === params.get('variable')) ?? variables[0];
		}

		if (params.get('partial')) {
			partial = params.get('partial') === 'true';
		}
	});

	onMount(() => {
		maplibregl.addProtocol('om', omProtocol);

		map = new maplibregl.Map({
			container: mapContainer as HTMLElement,
			style: `https://maptiler.servert.nl/styles/maps-minimal${mode.current === 'dark' ? '-dark' : ''}/style.json`,
			center: typeof domain.grid.center == 'object' ? domain.grid.center : [0, 0],
			zoom: domain?.grid.zoom,
			keyboard: false,
			hash: true,
			maxZoom: 11,
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

			// addHillshadeLayer();

			// map.addControl(
			// 	new maplibregl.TerrainControl({
			// 		source: 'terrainSource',
			// 		exaggeration: 1
			// 	})
			// );

			map.addControl(new DarkModeButton());
			map.addControl(new SettingsButton());
			map.addControl(new VariableButton());
			map.addControl(new PartialButton());
			map.addControl(new TimeButton());

			latest = await getDomainData();
			omUrl = getOMUrl();

			addOmFileLayer();

			// const testCoords = [
			// 	[7.5, 54],
			// 	[7.5, 50.5],
			// 	[3, 50.5],
			// 	[3, 54]
			// ];

			// for (let c of testCoords) {
			// 	new maplibregl.Marker().setLngLat(c).addTo(map);
			// }

			map.style.map.on('mousemove', function (e) {
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
						if ((hideZero.includes(variable.value) && value <= 0.25) || !value) {
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
			return `https://map-tiles.open-meteo.com/data_spatial/${domain.value}/${modelRunSelected.getUTCFullYear()}/${pad(modelRunSelected.getUTCMonth() + 1)}/${pad(modelRunSelected.getUTCDate())}/${pad(modelRunSelected.getUTCHours())}00Z/${timeSelected.getUTCFullYear()}-${pad(timeSelected.getUTCMonth() + 1)}-${pad(timeSelected.getUTCDate())}T${pad(timeSelected.getUTCHours())}00.om?dark=${darkMode}&variable=${variable.value}&bounds=${mapBounds.getSouth()},${mapBounds.getWest()},${mapBounds.getNorth()},${mapBounds.getEast()}&partial=${partial}`;
		} else {
			return `https://map-tiles.open-meteo.com/data_spatial/${domain.value}/${modelRunSelected.getUTCFullYear()}/${pad(modelRunSelected.getUTCMonth() + 1)}/${pad(modelRunSelected.getUTCDate())}/${pad(modelRunSelected.getUTCHours())}00Z/${timeSelected.getUTCFullYear()}-${pad(timeSelected.getUTCMonth() + 1)}-${pad(timeSelected.getUTCDate())}T${pad(timeSelected.getUTCHours())}00.om?dark=${darkMode}&variable=${variable.value}&partial=${partial}`;
		}
	};

	let colorScale = $derived.by(() => {
		return getColorScale(variable);
	});

	const getDomainData = async (latest = true): Promise<DomainMetaData> => {
		return new Promise((resolve) => {
			fetch(
				`https://map-tiles.open-meteo.com/data_spatial/${domain.value}/${latest ? 'latest' : 'in-progress'}.json`
			).then(async (result) => {
				const json = await result.json();
				if (latest) {
					const referenceTime = json.reference_time;
					modelRunSelected = new SvelteDate(referenceTime);

					if (modelRunSelected.getTime() - timeSelected.getTime() > 0) {
						timeSelected = new SvelteDate(referenceTime);
					}
					if (!json.variables.includes(variable.value)) {
						variable = variables.find((v) => v.value === json.variables[0]) ?? variables[0];
						url.searchParams.set('variable', variable.value);
						pushState(url + map._hash.getHashString(), {});
						toast('Variable set to: ' + variable.label);
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
				...Array(Math.round(referenceTime.getUTCHours() / domain.model_interval + 1))
			].map((_, i) => {
				let d = new SvelteDate();
				d.setUTCHours(i * domain.model_interval, 0, 0, 0);
				return d;
			});
			return returnArray;
		} else {
			return [];
		}
	});

	const checkClosestHourDomainInterval = () => {
		if (domain.time_interval > 1) {
			if (timeSelected.getUTCHours() % domain.time_interval > 0) {
				const closestUTCHour =
					timeSelected.getUTCHours() - (timeSelected.getUTCHours() % domain.time_interval);
				timeSelected.setUTCHours(closestUTCHour + domain.time_interval);
				url.searchParams.set('time', timeSelected.toISOString().replace(/[:Z]/g, '').slice(0, 15));
			}
		}
	};

	const checkClosestHourModelRun = () => {
		let modelRunChanged = false;
		const referenceTime = new Date(latest ? latest.reference_time : now);

		const year = timeSelected.getUTCFullYear();
		const month = timeSelected.getUTCMonth();
		const date = timeSelected.getUTCDate();

		const closestModelRunUTCHour =
			timeSelected.getUTCHours() - (timeSelected.getUTCHours() % domain.model_interval);

		const closestModelRun = new SvelteDate();
		closestModelRun.setUTCFullYear(year);
		closestModelRun.setUTCMonth(month);
		closestModelRun.setUTCDate(date);
		closestModelRun.setUTCHours(closestModelRunUTCHour);
		closestModelRun.setUTCMinutes(0);
		closestModelRun.setUTCSeconds(0);
		closestModelRun.setUTCMilliseconds(0);

		if (timeSelected.getTime() < modelRunSelected.getTime()) {
			modelRunSelected = new SvelteDate(closestModelRun);
			modelRunChanged = true;
		} else {
			if (referenceTime.getTime() === modelRunSelected.getTime()) {
				url.searchParams.delete('model_run');
				pushState(url + map._hash.getHashString(), {});
			} else if (
				timeSelected.getTime() > referenceTime.getTime() &&
				referenceTime.getTime() > modelRunSelected.getTime()
			) {
				modelRunSelected = new SvelteDate(referenceTime);
				modelRunChanged = true;
			} else if (timeSelected.getTime() < referenceTime.getTime() - 24 * 60 * 60 * 1000) {
				// Atleast yesterday, always update to nearest modelRun
				if (modelRunSelected.getTime() < closestModelRun.getTime()) {
					modelRunSelected = new SvelteDate(closestModelRun);
					modelRunChanged = true;
				}
			}
		}

		if (modelRunChanged) {
			url.searchParams.set(
				'model_run',
				modelRunSelected.toISOString().replace(/[:Z]/g, '').slice(0, 15)
			);
			pushState(url + map._hash.getHashString(), {});
			toast(
				'Model run set to: ' +
					modelRunSelected.getUTCFullYear() +
					'-' +
					pad(modelRunSelected.getUTCMonth() + 1) +
					'-' +
					pad(modelRunSelected.getUTCDate()) +
					' ' +
					pad(modelRunSelected.getUTCHours()) +
					':' +
					pad(modelRunSelected.getUTCMinutes())
			);
		}
		// day the data structure was altered
		if (modelRunSelected.getTime() < 1752624000000) {
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
	<Scale {showScale} {variable} />
	<SelectedVariables {domain} {variable} />
</div>
<TimeSelector
	bind:domain
	bind:timeSelected
	onDateChange={(date: Date) => {
		let newDate = new SvelteDate(date);

		timeSelected = newDate;

		url.searchParams.set('time', newDate.toISOString().replace(/[:Z]/g, '').slice(0, 15));
		pushState(url + map._hash.getHashString(), {});

		if (timeSelected.getUTCHours() % domain.time_interval > 0) {
			toast('Timestep not in interval, maybe force reload page');
		}

		changeOMfileURL();
	}}
	disabled={loading}
	{showTimeSelector}
/>
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
						domainChange={async (value: string) => {
							domain = domains.find((dm) => dm.value === value) ?? domains[0];
							checkClosestHourDomainInterval();
							url.searchParams.set('domain', value);
							url.searchParams.set(
								'time',
								timeSelected.toISOString().replace(/[:Z]/g, '').slice(0, 15)
							);
							pushState(url + map._hash.getHashString(), {});
							toast('Domain set to: ' + domain.label);
							latest = await getDomainData();
							changeOMfileURL();
						}}
						modelRunChange={(mr: Date) => {
							modelRunSelected = mr;
							url.searchParams.set('model_run', mr.toISOString().replace(/[:Z]/g, '').slice(0, 15));
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
