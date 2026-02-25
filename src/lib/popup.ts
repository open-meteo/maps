import { get } from 'svelte/store';

import { getColor, getColorScale, getValueFromLatLong } from '@openmeteo/mapbox-layer';
import * as maplibregl from 'maplibre-gl';
import { mode } from 'mode-watcher';

import {
	map as m,
	popup as p,
	popupFollowMouse as pFM,
	popupFollowMouse,
	showPopup
} from '$lib/stores/map';
import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
import { convertValue, getDisplayUnit, unitPreferences } from '$lib/stores/units';
import { variable as v } from '$lib/stores/variables';

import { textWhite } from './helpers';
import { rasterManager } from './layers';
import { opacity } from './stores/preferences';

let el: HTMLDivElement | undefined;
let wrapperDiv: HTMLDivElement | undefined;
let contentDiv: HTMLDivElement | undefined;
let valueSpan: HTMLSpanElement | undefined;
let unitSpan: HTMLSpanElement | undefined;
let elevationSpan: HTMLSpanElement | undefined;

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
const updatePopupContent = (coordinates: maplibregl.LngLat): void => {
	if (!el || !contentDiv || !valueSpan || !unitSpan || !elevationSpan) return;

	const map = get(m);

	const elevation = map?.queryTerrainElevation(coordinates);
	const hasElevation = typeof elevation === 'number' && isFinite(elevation);

	const { value } = getValueFromLatLong(
		coordinates.lat,
		coordinates.lng,
		rasterManager?.getActiveSourceUrl() ?? ''
	);

	if (isFinite(value)) {
		const isDark = mode.current === 'dark';
		const colorScale = getColorScale(get(v), isDark, omProtocolSettings.colorScales);
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
	} else {
		contentDiv.style.backgroundColor = '';
		contentDiv.style.color = '';
		valueSpan.innerText = 'Outside domain';
		unitSpan.innerText = '';
		elevationSpan.innerText = hasElevation ? `${Math.round(elevation)}m` : '';
	}
};

/** Ensure the marker exists, place it at `coordinates`, and update its content. */
export const renderPopup = (coordinates: maplibregl.LngLat): void => {
	const map = get(m);
	if (!get(showPopup) || !map) return;

	if (!el || !contentDiv || !valueSpan || !unitSpan || !elevationSpan) initPopupDiv();
	if (!el || !contentDiv || !valueSpan || !unitSpan || !elevationSpan) return;

	let popup = get(p);
	if (!popup) {
		popup = new maplibregl.Marker({ element: el, draggable: !get(pFM) })
			.setLngLat(coordinates)
			.addTo(map);
		p.set(popup);

		popup.on('dragstart', () => {
			if (el) el.classList.add('grabbing');
		});
		popup.on('drag', () => {
			const lngLat = popup?.getLngLat();
			if (lngLat) updatePopupContent(lngLat);
		});
		popup.on('dragend', () => {
			if (el) el.classList.remove('grabbing');
		});
	} else {
		popup.setLngLat(coordinates).addTo(map);
	}

	updatePopupContent(coordinates);
};

export const refreshPopup = (): void => {
	const popup = get(p);
	const lngLat = popup?.getLngLat();
	if (lngLat) updatePopupContent(lngLat);
};

const updatePopup = (e: maplibregl.MapMouseEvent): void => {
	if (get(popupFollowMouse)) {
		const popup = get(p);
		if (popup) {
			popup.setLngLat(e.lngLat);
		}
		renderPopup(e.lngLat);
	}
};

export const addPopup = (): void => {
	const map = get(m);
	if (!map) return;

	map.on('mousemove', updatePopup);

	map.on('click', (e: maplibregl.MapMouseEvent) => {
		if (!map) return;

		showPopup.set(!get(showPopup));

		if (!get(showPopup)) {
			const popup = get(p);
			popup?.remove();
			p.set(undefined);
			return;
		}

		renderPopup(e.lngLat);
	});
};
