import { get } from 'svelte/store';

import { getColor, getColorScale, getValueFromLatLong } from '@openmeteo/mapbox-layer';
import * as maplibregl from 'maplibre-gl';
import { mode } from 'mode-watcher';

import { map as m } from '$lib/stores/map';
import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
import { variable as v } from '$lib/stores/variables';

import { textWhite } from './helpers';
import { rasterManager } from './layers';

let popupCoordinates: maplibregl.LngLat | undefined;
let popup: maplibregl.Popup | undefined;
let showPopup = false;

const renderPopup = (coordinates: maplibregl.LngLat): void => {
	const map = get(m);
	if (!showPopup || !map) return;

	if (!popup) {
		popup = new maplibregl.Popup({ closeButton: false })
			.setLngLat(coordinates)
			.setHTML('<span class="value-popup">Outside domain</span>')
			.addTo(map);
	} else {
		popup.addTo(map);
	}

	const { value } = getValueFromLatLong(
		coordinates.lat,
		coordinates.lng,
		rasterManager?.getActiveSourceUrl() ?? ''
	);

	if (isFinite(value)) {
		const isDark = mode.current === 'dark';
		const colorScale = getColorScale(get(v), isDark, omProtocolSettings.colorScales);
		const color = getColor(colorScale, value);
		popup
			.setLngLat(coordinates)
			.setHTML(
				`<div style="font-weight:bold;background-color:rgba(${color.join(',')});color:${textWhite(color, isDark) ? 'white' : 'black'};" class="popup-div">` +
					`<span class="popup-value">${value.toFixed(1)}</span>${colorScale.unit}</div>`
			);
	} else {
		popup
			.setLngLat(coordinates)
			.setHTML('<span style="padding:3px 5px;" class="popup-string">Outside domain</span>');
	}
};

const updatePopup = (e: maplibregl.MapMouseEvent): void => {
	popupCoordinates = e.lngLat;
	renderPopup(e.lngLat);
};

export const refreshPopup = (): void => {
	if (popupCoordinates) renderPopup(popupCoordinates);
};

export const addPopup = (): void => {
	const map = get(m);
	if (!map) return;

	map.on('mousemove', updatePopup);
	map.on('click', (e: maplibregl.MapMouseEvent) => {
		const map = get(m);
		if (!map) return;
		showPopup = !showPopup;
		if (!showPopup) popup?.remove();
		if (showPopup) popup?.setLngLat(e.lngLat).addTo(map);
		updatePopup(e);
	});
};
