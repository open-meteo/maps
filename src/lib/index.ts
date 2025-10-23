import { get } from 'svelte/store';

import { SvelteDate } from 'svelte/reactivity';

import { toast } from 'svelte-sonner';

import { mode } from 'mode-watcher';

import * as maplibregl from 'maplibre-gl';

import { pushState } from '$app/navigation';

import {
	time,
	loading,
	domain as d,
	variables,
	modelRun as mR,
	mapBounds as mB,
	preferences as p,
	paddedBounds as pB,
	paddedBoundsLayer,
	paddedBoundsSource as pBS,
	paddedBoundsGeoJSON,
	variableSelectionExtended,
	contourInterval
} from '$lib/stores/preferences';

import {
	hideZero,
	getColorScale,
	domainOptions,
	variableOptions,
	getValueFromLatLong,
	getColor,
	getOpacity
} from '@openmeteo/mapbox-layer';

import type { DomainMetaData } from '@openmeteo/mapbox-layer';

const preferences = get(p);

const beforeLayer = 'waterway-tunnel';

const now = new SvelteDate();
now.setHours(now.getHours() + 1, 0, 0, 0);

let omUrl: string;

export const pad = (n: string | number) => {
	return ('0' + n).slice(-2);
};

export const urlParamsToPreferences = (url: URL) => {
	const params = new URLSearchParams(url.search);

	const urlModelTime = params.get('model-run');
	if (urlModelTime && urlModelTime.length == 15) {
		const year = parseInt(urlModelTime.slice(0, 4));
		const month = parseInt(urlModelTime.slice(5, 7)) - 1;
		const day = parseInt(urlModelTime.slice(8, 10));
		const hour = parseInt(urlModelTime.slice(11, 13));
		const minute = parseInt(urlModelTime.slice(13, 15));
		// Parse Date from UTC components (urlTime is in UTC)
		mR.set(new SvelteDate(Date.UTC(year, month, day, hour, minute, 0, 0)));
	} else {
		const modelRun = get(mR);
		modelRun.setUTCHours(0, 0, 0, 0);
		mR.set(modelRun);
	}

	const urlTime = params.get('time');
	if (urlTime && urlTime.length == 15) {
		const year = parseInt(urlTime.slice(0, 4));
		const month = parseInt(urlTime.slice(5, 7)) - 1;
		const day = parseInt(urlTime.slice(8, 10));
		const hour = parseInt(urlTime.slice(11, 13));
		const minute = parseInt(urlTime.slice(13, 15));
		// Parse Date from UTC components (urlTime is in UTC)
		time.set(new SvelteDate(Date.UTC(year, month, day, hour, minute, 0, 0)));
	}
	checkClosestDomainInterval(url);

	if (params.get('globe')) {
		preferences.globe = params.get('globe') === 'true';
	} else {
		if (preferences.globe) {
			url.searchParams.set('globe', String(preferences.globe));
		}
	}

	if (params.get('partial')) {
		preferences.partial = params.get('partial') === 'true';
	} else {
		if (preferences.partial) {
			url.searchParams.set('partial', String(preferences.partial));
		}
	}

	if (params.get('terrain')) {
		preferences.terrain = params.get('terrain') === 'true';
	} else {
		if (preferences.terrain) {
			url.searchParams.set('terrain', String(preferences.terrain));
		}
	}

	if (params.get('domain')) {
		d.set(domainOptions.find((dm) => dm.value === params.get('domain')) ?? domainOptions[0]);
	}

	if (params.get('variables')) {
		variables.set([
			variableOptions.find((v) => v.value === params.get('variables')) ?? variableOptions[0]
		]);
	}

	if (params.get('hillshade')) {
		preferences.hillshade = params.get('hillshade') === 'true';
	} else {
		if (preferences.hillshade) {
			url.searchParams.set('hillshade', String(preferences.hillshade));
		}
	}

	if (params.get('time-selector')) {
		preferences.timeSelector = params.get('time-selector') === 'true';
	} else {
		if (!preferences.timeSelector) {
			url.searchParams.set('time-selector', String(preferences.timeSelector));
		}
	}

	if (params.get('clip-water')) {
		preferences.clipWater = params.get('clip-water') === 'true';
	} else {
		if (preferences.clipWater) {
			url.searchParams.set('clip-water', String(preferences.clipWater));
		}
	}

	if (params.get('contours')) {
		preferences.contours = params.get('contours') === 'true';
	} else {
		if (preferences.contours) {
			url.searchParams.set('contours', String(preferences.contours));
		}
	}

	if (params.get('interval')) {
		contourInterval.set(Number(params.get('contours')));
	} else {
		if (get(contourInterval) !== 2) {
			url.searchParams.set('interval', String(get(contourInterval)));
		}
	}

	if (params.get('variables-open')) {
		variableSelectionExtended.set(true);
	}

	p.set(preferences);
};

export const checkClosestDomainInterval = (url: URL) => {
	const t = get(time);
	const domain = get(d);
	if (domain.time_interval > 1) {
		if (t.getUTCHours() % domain.time_interval > 0) {
			const closestUTCHour = t.getUTCHours() - (t.getUTCHours() % domain.time_interval);
			t.setUTCHours(closestUTCHour + domain.time_interval);
			url.searchParams.set('time', t.toISOString().replace(/[:Z]/g, '').slice(0, 15));
		}
	}
	time.set(t);
};

export const checkClosestModelRun = (
	map: maplibregl.Map,
	url: URL,
	latest: DomainMetaData | undefined
) => {
	const t = get(time);
	const domain = get(d);
	const modelRun = get(mR);

	let modelRunChanged = false;
	let referenceTime: Date | undefined;
	if (latest) {
		referenceTime = new Date(latest.reference_time);
	}

	const year = t.getUTCFullYear();
	const month = t.getUTCMonth();
	const date = t.getUTCDate();

	const closestModelRunUTCHour = t.getUTCHours() - (t.getUTCHours() % domain.model_interval);

	const closestModelRun = new SvelteDate();
	closestModelRun.setUTCFullYear(year);
	closestModelRun.setUTCMonth(month);
	closestModelRun.setUTCDate(date);
	closestModelRun.setUTCHours(closestModelRunUTCHour);
	closestModelRun.setUTCMinutes(0);
	closestModelRun.setUTCSeconds(0);
	closestModelRun.setUTCMilliseconds(0);

	if (t.getTime() < modelRun.getTime()) {
		mR.set(new SvelteDate(closestModelRun));
		modelRunChanged = true;
	} else {
		if (referenceTime) {
			if (referenceTime.getTime() === modelRun.getTime()) {
				url.searchParams.delete('model-run');
				pushState(url + map._hash.getHashString(), {});
			} else if (
				t.getTime() > referenceTime.getTime() &&
				referenceTime.getTime() > modelRun.getTime()
			) {
				mR.set(new SvelteDate(referenceTime));
				modelRunChanged = true;
			} else if (t.getTime() < referenceTime.getTime() - 24 * 60 * 60 * 1000) {
				// Atleast yesterday, always update to nearest modelRun
				if (modelRun.getTime() < closestModelRun.getTime()) {
					mR.set(new SvelteDate(closestModelRun));
					modelRunChanged = true;
				}
			}
		}
	}

	if (modelRunChanged) {
		url.searchParams.set('model-run', modelRun.toISOString().replace(/[:Z]/g, '').slice(0, 15));
		pushState(url + map._hash.getHashString(), {});
		toast.info(
			'Model run set to: ' +
				modelRun.getUTCFullYear() +
				'-' +
				pad(modelRun.getUTCMonth() + 1) +
				'-' +
				pad(modelRun.getUTCDate()) +
				' ' +
				pad(modelRun.getUTCHours()) +
				':' +
				pad(modelRun.getUTCMinutes())
		);
	}
	// day the data structure was altered
	if (modelRun.getTime() < 1752624000000) {
		toast.warning('Date selected probably too old, since data structure altered on 16th July 2025');
	}
};

export const setMapControlSettings = (map: maplibregl.Map, url: URL) => {
	map.touchZoomRotate.disableRotation();

	const navigationControl = new maplibregl.NavigationControl({
		visualizePitch: true,
		showZoom: true,
		showCompass: true
	});
	map.addControl(navigationControl);

	const locateControl = new maplibregl.GeolocateControl({
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
	globeControl._globeButton.addEventListener('click', () => globeHandler(map, url));

	// improved scrolling
	map.scrollZoom.setZoomRate(1 / 85);
	map.scrollZoom.setWheelZoomRate(1 / 85);
};

export const addHillshadeSources = (map: maplibregl.Map) => {
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
		tiles: ['mapterhorn://{z}/{x}/{y}'],
		encoding: 'terrarium',
		tileSize: 512,
		attribution: '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>'
	});
};

export const addHillshadeLayer = (map: maplibregl.Map) => {
	map.addLayer(
		{
			source: 'terrainSource',
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

let omRasterSource: maplibregl.RasterTileSource | undefined;
export const addOmFileLayers = (map: maplibregl.Map) => {
	omUrl = getOMUrl();
	map.addSource('omRasterSource', {
		url: 'om://' + omUrl,
		type: 'raster',
		tileSize: 256,
		maxzoom: 12
	});

	omRasterSource = map.getSource('omRasterSource');
	if (omRasterSource) {
		omRasterSource.on('error', (e) => {
			checked = 0;
			loading.set(false);
			clearInterval(checkSourceLoadedInterval);
			toast.error(e.error.message);
		});
	}

	map.addLayer(
		{
			id: 'omRasterLayer',
			type: 'raster',
			source: 'omRasterSource'
		},
		beforeLayer
	);

	if (preferences.contours) {
		addVectorLayer(map);
	}
};

let omGridLayer: maplibregl.StyleLayer | undefined;
let omGridSource: maplibregl.VectorTileSource | undefined;
let omVectorLayer: maplibregl.StyleLayer | undefined;
let omVectorSource: maplibregl.VectorTileSource | undefined;
let omVectorLayerLabels: maplibregl.StyleLayer | undefined;
export const addVectorLayer = (map: maplibregl.Map) => {
	// grid points
	// map.addSource('omGridSource', {
	// 	url: 'om://' + omUrl + '&grid=true',
	// 	type: 'vector'
	// });
	// omGridSource = map.getSource('omGridSource');

	// contouring lines
	map.addSource('omVectorSource', {
		url: 'om://' + omUrl,
		type: 'vector'
	});
	omVectorSource = map.getSource('omVectorSource');
	if (omVectorSource) {
		omVectorSource.on('error', (e) => {
			toast.error(e.error.message);
		});
	}

	map.addLayer({
		id: 'omVectorLayer',
		type: 'line',
		source: 'omVectorSource',
		'source-layer': 'contours',
		paint: {
			'line-color': 'rgba(0,0,0,0.5)',
			'line-width': [
				'case',
				['boolean', ['==', ['%', ['to-number', ['get', 'value']], 100], 0], false],
				3,
				[
					'case',
					['boolean', ['==', ['%', ['to-number', ['get', 'value']], 50], 0], false],
					2,
					[
						'case',
						['boolean', ['==', ['%', ['to-number', ['get', 'value']], 10], 0], false],
						1.5,
						1
					]
				]
			]
		}
	});
	omVectorLayer = map.getLayer('omVectorLayer');

	map.addLayer({
		id: 'omVectorLayerLabels',
		type: 'symbol',
		source: 'omVectorSource',
		'source-layer': 'contours',
		layout: {
			'symbol-placement': 'line-center',
			'symbol-spacing': 1,
			'text-font': ['Noto Sans Regular'],
			'text-field': ['to-string', ['get', 'value']],
			'text-padding': 1,
			'text-offset': [0, -0.6]
			//'text-allow-overlap': true,
			//'text-ignore-placement': true
		},
		paint: {
			'text-color': 'rgba(0,0,0,0.7)'
		}
	});
	omVectorLayerLabels = map.getLayer('omVectorLayerLabels');
};

export const removeVectorLayer = (map: maplibregl.Map) => {
	if (omVectorLayerLabels) {
		map.removeLayer('omVectorLayerLabels');
	}
	if (omVectorLayer) {
		map.removeLayer('omVectorLayer');
	}
	if (omVectorSource) {
		map.removeSource('omVectorSource');
	}
};

export const terrainHandler = (map: maplibregl.Map, url: URL) => {
	preferences.terrain = !preferences.terrain;
	p.set(preferences);
	if (preferences.terrain) {
		url.searchParams.set('terrain', String(preferences.terrain));
	} else {
		url.searchParams.delete('terrain');
	}
	pushState(url + map._hash.getHashString(), {});
};

export const globeHandler = (map: maplibregl.Map, url: URL) => {
	preferences.globe = !preferences.globe;
	p.set(preferences);
	if (preferences.globe) {
		url.searchParams.set('globe', String(preferences.globe));
	} else {
		url.searchParams.delete('globe');
	}
	pushState(url + map._hash.getHashString(), {});
};

let checked = 0;
let checkSourceLoadedInterval: ReturnType<typeof setInterval>;
export const changeOMfileURL = (
	map: maplibregl.Map,
	url: URL,
	latest?: DomainMetaData | undefined,
	resetBounds = true
) => {
	if (map && omRasterSource) {
		loading.set(true);
		if (popup) {
			popup.remove();
		}
		mB.set(map.getBounds());
		if (resetBounds) {
			pB.set(map.getBounds());
		}
		getPaddedBounds(map);

		// if (!preferences.contours && get(variables)[0].value === 'pressure_msl') {
		// 	preferences.contours = true;
		// 	if (!omVectorSource) {
		// 		addVectorLayer(map);
		// 	}
		// 	p.set(preferences);
		// 	toast.info('Contours turned on for Pressure map');
		// }

		checkClosestModelRun(map, url, latest);

		omUrl = getOMUrl();
		omRasterSource.setUrl('om://' + omUrl);
		if (omVectorSource) {
			omVectorSource.setUrl('om://' + omUrl);
		}
		if (omGridSource) {
			omGridSource.setUrl('om://' + omUrl + '&grid=true');
		}

		checkSourceLoadedInterval = setInterval(() => {
			checked++;
			if ((omRasterSource && omRasterSource.loaded()) || checked >= 200) {
				if (checked >= 200) {
					// Timeout after 10s
					toast.error('Request timed out');
				}
				checked = 0;
				loading.set(false);
				clearInterval(checkSourceLoadedInterval);
			}
		}, 50);
	}
};

export const getStyle = async () => {
	return await fetch(
		`https://maptiler.servert.nl/styles/minimal-world-maps${mode.current === 'dark' ? '-dark' : ''}${preferences.clipWater ? '-water-clip' : ''}/style.json`
	)
		.then((response) => response.json())
		.then((style) => {
			if (preferences.globe) {
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
};

export const textWhite = ([r, g, b]: [number, number, number]): boolean => {
	return r * 0.299 + g * 0.587 + b * 0.114 <= 186;
};

let popup: maplibregl.Popup | undefined;
let showPopup = false;
export const addPopup = (map: maplibregl.Map) => {
	let variable = get(variables)[0];
	let colorScale = getColorScale(variable.value);

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
			const { value } = getValueFromLatLong(coordinates.lat, coordinates.lng, variable, colorScale);

			if (value) {
				if ((hideZero.includes(variable.value) && value <= 0.25) || !value) {
					popup.remove();
				} else {
					const color = getColor(colorScale, value);
					const opacity = getOpacity(variable.value, value, mode.current === 'dark', colorScale);
					const content =
						'<span class="popup-value">' + value.toFixed(1) + '</span>' + colorScale.unit;
					popup
						.setLngLat(coordinates)
						.setHTML(
							`<div style="font-weight: bold; background-color: rgba(${color[0]}, ${color[1]}, ${color[2]}, ${opacity / 255}); color: ${textWhite(color) ? 'white' : 'black'};" class="popup-div">${content}</div>`
						);
				}
			} else {
				popup
					.setLngLat(coordinates)
					.setHTML(`<span style="padding: 3px 5px;" class="popup-string">Outside domain</span>`);
			}
		}
	});

	map.on('click', (e: maplibregl.MapMouseEvent) => {
		variable = get(variables)[0];
		colorScale = getColorScale(get(variables)[0].value);

		showPopup = !showPopup;
		if (!showPopup && popup) {
			popup.remove();
		}
		if (showPopup && popup) {
			const coordinates = e.lngLat;
			popup.setLngLat(coordinates).addTo(map);
		}
	});
};

const padding = 25; //%
export const checkBounds = (map: maplibregl.Map, url: URL, latest: DomainMetaData | undefined) => {
	const domain = get(d);
	const geojson = get(paddedBoundsGeoJSON);
	const paddedBounds = get(pB);
	const mapBounds = map.getBounds();
	const paddedBoundsSource = get(pBS);

	mB.set(mapBounds);

	if (paddedBounds && preferences.partial) {
		let exceededPadding = false;

		if (geojson) {
			// @ts-expect-error stupid conflicting types from geojson
			geojson.features[0].geometry.coordinates = [
				[paddedBounds?.getSouthWest()['lng'], paddedBounds?.getSouthWest()['lat']],
				[paddedBounds?.getNorthWest()['lng'], paddedBounds?.getNorthWest()['lat']],
				[paddedBounds?.getNorthEast()['lng'], paddedBounds?.getNorthEast()['lat']],
				[paddedBounds?.getSouthEast()['lng'], paddedBounds?.getSouthEast()['lat']],
				[paddedBounds?.getSouthWest()['lng'], paddedBounds?.getSouthWest()['lat']]
			];
			paddedBoundsSource?.setData(geojson);
		}

		if (
			mapBounds.getSouth() < paddedBounds.getSouth() &&
			paddedBounds.getSouth() > domain.grid.latMin
		) {
			exceededPadding = true;
		}
		if (
			mapBounds.getWest() < paddedBounds.getWest() &&
			paddedBounds.getWest() > domain.grid.lonMin
		) {
			exceededPadding = true;
		}
		if (
			mapBounds.getNorth() > paddedBounds.getNorth() &&
			paddedBounds.getNorth() < domain.grid.latMin + domain.grid.ny * domain.grid.dy
		) {
			exceededPadding = true;
		}
		if (
			mapBounds.getEast() > paddedBounds.getEast() &&
			paddedBounds.getEast() < domain.grid.lonMin + domain.grid.nx * domain.grid.dx
		) {
			exceededPadding = true;
		}
		if (exceededPadding) {
			changeOMfileURL(map, url, latest, false);
		}
	}
};

export const getPaddedBounds = (map: maplibregl.Map) => {
	const domain = get(d);
	const mapBounds = get(mB);
	const paddedBounds = get(pB);
	const paddedBoundsSource = get(pBS);

	if (mapBounds && preferences.partial) {
		if (!paddedBoundsSource) {
			paddedBoundsGeoJSON.set({
				type: 'FeatureCollection',
				features: [
					{
						type: 'Feature',
						geometry: {
							type: 'LineString',
							// @ts-expect-error stupid conflicting types from geojson
							properties: {},
							coordinates: [
								[domain.grid.lonMin, domain.grid.latMin],
								[domain.grid.lonMin, domain.grid.latMin + domain.grid.ny * domain.grid.dy],
								[
									domain.grid.lonMin + domain.grid.nx * domain.grid.dx,
									domain.grid.latMin + domain.grid.ny * domain.grid.dy
								],
								[domain.grid.lonMin + domain.grid.nx * domain.grid.dx, domain.grid.latMin],
								[domain.grid.lonMin, domain.grid.latMin]
							]
						}
					}
				]
			});

			map.addSource('paddedBoundsSource', {
				type: 'geojson',
				data: get(paddedBoundsGeoJSON) as GeoJSON.GeoJSON
			});
			pBS.set(map.getSource('paddedBoundsSource'));

			map.addLayer({
				id: 'paddedBoundsLayer',
				type: 'line',
				source: 'paddedBoundsSource',
				layout: {
					'line-join': 'round',
					'line-cap': 'round'
				},
				paint: {
					'line-color': 'orange',
					'line-width': 5
				}
			});
			paddedBoundsLayer.set(map.getLayer('paddedBoundsLayer'));
		}

		const mapBoundsSW = mapBounds.getSouthWest();
		const mapBoundsNE = mapBounds.getNorthEast();
		const dLat = mapBoundsNE['lat'] - mapBoundsSW['lat'];
		const dLon = mapBoundsNE['lng'] - mapBoundsSW['lng'];

		paddedBounds?.setSouthWest([
			Math.max(Math.max(mapBoundsSW['lng'] - (dLon * padding) / 100, domain.grid.lonMin), -180),
			Math.max(Math.max(mapBoundsSW['lat'] - (dLat * padding) / 100, domain.grid.latMin), -90)
		]);
		paddedBounds?.setNorthEast([
			Math.min(
				Math.min(
					mapBoundsNE['lng'] + (dLon * padding) / 100,
					domain.grid.lonMin + domain.grid.nx * domain.grid.dx
				),
				180
			),
			Math.min(
				Math.min(
					mapBoundsNE['lat'] + (dLat * padding) / 100,
					domain.grid.latMin + domain.grid.ny * domain.grid.dy
				),
				90
			)
		]);
		pB.set(paddedBounds);
	}
};

export const getOMUrl = () => {
	const domain = get(d);
	const modelRun = get(mR);
	const paddedBounds = get(pB);
	if (paddedBounds) {
		return `https://map-tiles.open-meteo.com/data_spatial/${domain.value}/${modelRun.getUTCFullYear()}/${pad(modelRun.getUTCMonth() + 1)}/${pad(modelRun.getUTCDate())}/${pad(modelRun.getUTCHours())}00Z/${get(time).getUTCFullYear()}-${pad(get(time).getUTCMonth() + 1)}-${pad(get(time).getUTCDate())}T${pad(get(time).getUTCHours())}00.om?dark=${mode.current === 'dark'}&variable=${get(variables)[0].value}&bounds=${paddedBounds.getSouth()},${paddedBounds.getWest()},${paddedBounds.getNorth()},${paddedBounds.getEast()}&partial=${preferences.partial}&interval=${get(contourInterval)}`;
	} else {
		return `https://map-tiles.open-meteo.com/data_spatial/${domain.value}/${modelRun.getUTCFullYear()}/${pad(modelRun.getUTCMonth() + 1)}/${pad(modelRun.getUTCDate())}/${pad(modelRun.getUTCHours())}00Z/${get(time).getUTCFullYear()}-${pad(get(time).getUTCMonth() + 1)}-${pad(get(time).getUTCDate())}T${pad(get(time).getUTCHours())}00.om?dark=${mode.current === 'dark'}&variable=${get(variables)[0].value}&partial=${preferences.partial}&interval=${get(contourInterval)}`;
	}
};
