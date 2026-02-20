import { get } from 'svelte/store';

import { getColor, getColorScale, getValueFromLatLong } from '@openmeteo/mapbox-layer';
import * as maplibregl from 'maplibre-gl';
import { mode } from 'mode-watcher';

import { map as m } from '$lib/stores/map';
import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
import { variable as v } from '$lib/stores/variables';

import { textWhite } from './helpers';
import { rasterManager } from './layers';

let popup: maplibregl.Marker | undefined;
let showPopup = false;

let el: HTMLDivElement | undefined;
let contentDiv: HTMLDivElement | undefined;
let valueSpan: HTMLSpanElement | undefined;
let unitSpan: HTMLSpanElement | undefined;

const initPopupDiv = (): void => {
	el = document.createElement('div');
	el.classList.add('popup-wrapper');

	const tipDiv = document.createElement('div');
	tipDiv.classList.add('popup-tip');
	el.append(tipDiv);

	contentDiv = document.createElement('div');
	contentDiv.classList.add('popup-content');

	valueSpan = document.createElement('span');
	valueSpan.classList.add('popup-value');
	unitSpan = document.createElement('span');
	unitSpan.classList.add('popup-unit');

	contentDiv.append(valueSpan);
	contentDiv.append(unitSpan);
	el.append(contentDiv);
};

/** Update the popup content for the given coordinates without moving the marker. */
const updatePopupContent = (coordinates: maplibregl.LngLat): void => {
	if (!el || !contentDiv || !valueSpan || !unitSpan) return;

	const { value } = getValueFromLatLong(
		coordinates.lat,
		coordinates.lng,
		rasterManager?.getActiveSourceUrl() ?? ''
	);

	if (isFinite(value)) {
		const isDark = mode.current === 'dark';
		const colorScale = getColorScale(get(v), isDark, omProtocolSettings.colorScales);
		const color = getColor(colorScale, value);
		contentDiv.style.backgroundColor = `rgba(${color.join(',')})`;
		contentDiv.style.color = textWhite(color, isDark) ? 'white' : 'black';
		valueSpan.innerText = value.toFixed(1);
		unitSpan.innerText = colorScale.unit;
	} else {
		contentDiv.style.backgroundColor = '';
		contentDiv.style.color = '';
		valueSpan.innerText = 'Outside domain';
		unitSpan.innerText = '';
	}
};

/** Ensure the marker exists, place it at `coordinates`, and update its content. */
const renderPopup = (coordinates: maplibregl.LngLat): void => {
	const map = get(m);
	if (!showPopup || !map) return;

	if (!el || !contentDiv || !valueSpan || !unitSpan) initPopupDiv();
	if (!el || !contentDiv || !valueSpan || !unitSpan) return;

	if (!popup) {
		popup = new maplibregl.Marker({ element: el, draggable: true })
			.setLngLat(coordinates)
			.addTo(map);

		popup.on('drag', () => {
			const lngLat = popup?.getLngLat();
			if (lngLat) updatePopupContent(lngLat);
		});
	} else {
		popup.setLngLat(coordinates).addTo(map);
	}

	updatePopupContent(coordinates);
};

export const refreshPopup = (): void => {
	const lngLat = popup?.getLngLat();
	if (lngLat) updatePopupContent(lngLat);
};

export const addPopup = (): void => {
	const map = get(m);
	if (!map) return;

	map.on('click', (e: maplibregl.MapMouseEvent) => {
		if (!map) return;

		showPopup = !showPopup;

		if (!showPopup) {
			popup?.remove();
			return;
		}

		renderPopup(e.lngLat);
	});
};
