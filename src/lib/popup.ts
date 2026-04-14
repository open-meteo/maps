import { get } from 'svelte/store';

import {
	GridFactory,
	createClippingTester,
	getCachedResolvedClipping,
	getColor,
	getColorScale,
	getValueFromLatLong
} from '@openmeteo/weather-map-layer';
import * as maplibregl from 'maplibre-gl';
import { mode } from 'mode-watcher';

import { map as m, popup as p, popupMode } from '$lib/stores/map';
import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
import { convertValue, getDisplayUnit, unitPreferences } from '$lib/stores/units';
import { selectedDomain, variable as v } from '$lib/stores/variables';

import { textWhite } from './helpers';
import { rasterManager } from './layers';
import { terraDrawActive } from './stores/clipping';
import { desktop, opacity } from './stores/preferences';

let el: HTMLDivElement | undefined;
let wrapperDiv: HTMLDivElement | undefined;
let contentDiv: HTMLDivElement | undefined;
let valueSpan: HTMLSpanElement | undefined;
let unitSpan: HTMLSpanElement | undefined;
let elevationSpan: HTMLSpanElement | undefined;

// Cached clipping tester — recomputed only when clippingOptions reference changes.
let cachedClippingOptionsRef: unknown = undefined;
let cachedClippingTester: ((lon: number, lat: number) => boolean) | undefined;

const initPopupDiv = (): void => {
	el = document.createElement('div');
	el.classList.add('popup');

	const stemDiv = document.createElement('div');
	stemDiv.classList.add('popup-stem');
	const dotDiv = document.createElement('div');
	dotDiv.classList.add('popup-dot');
	stemDiv.append(dotDiv);
	el.append(stemDiv);

	wrapperDiv = document.createElement('div');
	wrapperDiv.classList.add('popup-wrapper');

	contentDiv = document.createElement('div');
	contentDiv.classList.add('popup-content');

	valueSpan = document.createElement('span');
	valueSpan.classList.add('popup-value');
	unitSpan = document.createElement('span');
	unitSpan.classList.add('popup-unit');
	elevationSpan = document.createElement('span');
	elevationSpan.classList.add('popup-elevation');

	contentDiv.append(valueSpan);
	contentDiv.append(unitSpan);
	contentDiv.append(elevationSpan);

	wrapperDiv.append(contentDiv);
	el.append(wrapperDiv);
};

/** Update the popup content for the given coordinates without moving the marker. */
const updatePopupContent = async (coordinates: maplibregl.LngLat): Promise<void> => {
	if (!el || !contentDiv || !valueSpan || !unitSpan || !elevationSpan) return;

	const map = get(m);

	const elevation = map?.queryTerrainElevation(coordinates);
	const hasElevation = typeof elevation === 'number' && isFinite(elevation);

	const activeUrl = rasterManager?.getActiveSourceUrl();
	if (!activeUrl) return;

	const { value } = await getValueFromLatLong(coordinates.lat, coordinates.lng, activeUrl);

	if (isFinite(value)) {
		const omProtocolSettingsState = get(omProtocolSettings);
		const clippingOptions = omProtocolSettingsState.clippingOptions;

		if (clippingOptions) {
			if (clippingOptions !== cachedClippingOptionsRef) {
				cachedClippingOptionsRef = clippingOptions;
				cachedClippingTester = createClippingTester(getCachedResolvedClipping(clippingOptions));
			}
			if (cachedClippingTester && !cachedClippingTester(coordinates.lng, coordinates.lat)) {
				contentDiv.style.backgroundColor = '';
				contentDiv.style.color = '';
				valueSpan.innerText = 'Outside clip';
				unitSpan.innerText = '';
				elevationSpan.innerText = hasElevation ? `${Math.round(elevation)}m` : '';
				return;
			}
		}

		const isDark = mode.current === 'dark';
		const colorScale = getColorScale(get(v), isDark, omProtocolSettingsState.colorScales);
		const color = getColor(colorScale, value);

		const popupOpacity =
			color[3] && color[3] ? (color[3] * get(opacity)) / 100 : get(opacity) / 100;

		contentDiv.style.backgroundColor = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${popupOpacity})`;
		contentDiv.style.color = textWhite(color, isDark) ? 'white' : 'black';
		const units = get(unitPreferences);
		const displayValue = convertValue(value, colorScale.unit, units);
		valueSpan.innerText = displayValue.toFixed(1);
		unitSpan.innerText = getDisplayUnit(colorScale.unit, units);
		elevationSpan.innerText = hasElevation ? `${Math.round(elevation)}m` : '';
		elevationSpan.style.color = textWhite(color, isDark) ? 'white' : 'black';
	} else {
		contentDiv.style.backgroundColor = '';
		contentDiv.style.color = '';

		const domainBounds = GridFactory.create(get(selectedDomain).grid).getBounds();
		const [minLon, minLat, maxLon, maxLat] = domainBounds;
		const insideDomain =
			coordinates.lat >= minLat &&
			coordinates.lat <= maxLat &&
			coordinates.lng >= minLon &&
			coordinates.lng <= maxLon;

		valueSpan.innerText = insideDomain ? 'No data' : 'Outside domain';
		unitSpan.innerText = '';
		elevationSpan.innerText = hasElevation ? `${Math.round(elevation)}m` : '';
		elevationSpan.style.color = '';
	}
};

/** Ensure the marker exists, place it at `coordinates`, and update its content. */
export const renderPopup = async (coordinates: maplibregl.LngLat): Promise<void> => {
	const map = get(m);
	if (!get(popupMode) || !map) return;

	if (!el || !contentDiv || !valueSpan || !unitSpan || !elevationSpan) initPopupDiv();
	if (!el || !contentDiv || !valueSpan || !unitSpan || !elevationSpan) return;

	let popup = get(p);
	if (!popup) {
		popup = new maplibregl.Marker({ element: el, draggable: get(popupMode) === 'drag' })
			.setLngLat(coordinates)
			.addTo(map);
		p.set(popup);

		popup.on('drag', async () => {
			const lngLat = popup?.getLngLat();
			if (lngLat) await updatePopupContent(lngLat);
		});
	} else {
		popup.setLngLat(coordinates).addTo(map);
	}

	await updatePopupContent(coordinates);
};

export const refreshPopup = async (): Promise<void> => {
	const popup = get(p);
	const lngLat = popup?.getLngLat();
	if (lngLat) await updatePopupContent(lngLat);
};

const updatePopup = async (e: maplibregl.MapMouseEvent): Promise<void> => {
	if (get(popupMode) === 'follow' && !get(terraDrawActive)) {
		const popup = get(p);
		if (popup) {
			popup.setLngLat(e.lngLat);
		}
		await renderPopup(e.lngLat);
	}
};

export const switchPopupMode = (): void => {
	if (get(popupMode) === null) {
		if (desktop.current) {
			popupMode.set('follow');
		} else {
			popupMode.set('drag');
		}
	} else if (get(popupMode) === 'follow') {
		popupMode.set('drag');
		return;
	} else if (get(popupMode) === 'drag') {
		popupMode.set(null);
		return;
	}
};

export const addPopup = (): void => {
	const map = get(m);
	if (!map) return;

	map.on('mousemove', updatePopup);

	map.on('click', async (e: maplibregl.MapLayerMouseEvent) => {
		if (!map || get(terraDrawActive)) return;

		switchPopupMode();

		if (get(popupMode) === null) {
			removePopup();
			return;
		}

		// Re-add mousemove listener (may have been removed by a previous removePopup)
		map.off('mousemove', updatePopup);
		map.on('mousemove', updatePopup);

		await renderPopup(e.lngLat);
	});
};

export const removePopup = (): void => {
	const map = get(m);
	if (!map) return;

	map.off('mousemove', updatePopup);

	const popup = get(p);
	popup?.remove();
	p.set(undefined);
};
