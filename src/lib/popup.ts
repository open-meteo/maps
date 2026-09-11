import { get } from 'svelte/store';

import {
	GridFactory,
	LEVEL_PREFIX,
	LEVEL_UNIT_REGEX,
	createClippingTester,
	getCachedResolvedClipping,
	getColor,
	getColorScale,
	getValueFromLatLong,
	variableOptions
} from '@openmeteo/weather-map-layer';
import * as maplibregl from 'maplibre-gl';
import { mode } from 'mode-watcher';

import { activeChart, chartSources, pickPrimarySource } from '$lib/stores/chart';
import { map as m, popup as p, popupMode } from '$lib/stores/map';
import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
import { convertValue, getDisplayUnit, unitPreferences } from '$lib/stores/units';
import { selectedDomain } from '$lib/stores/variables';

import { sourceKey } from './chart-encoding';
import { textWhite } from './helpers';
import { getActiveOmUrls } from './layers';
import { terraDrawActive } from './stores/clipping';
import { desktop, opacity } from './stores/preferences';

let el: HTMLDivElement | undefined;
let wrapperDiv: HTMLDivElement | undefined;
let contentDiv: HTMLDivElement | undefined;
let valueSpan: HTMLSpanElement | undefined;
let unitSpan: HTMLSpanElement | undefined;
let elevationSpan: HTMLSpanElement | undefined;
let extrasDiv: HTMLDivElement | undefined;
let stemDiv: HTMLDivElement | undefined;

// Cached clipping tester — recomputed only when clippingOptions reference changes.
let cachedClippingOptionsRef: unknown = undefined;
let cachedClippingTester: ((lon: number, lat: number) => boolean) | undefined;

const initPopupDiv = (): void => {
	el = document.createElement('div');
	el.classList.add('popup');

	stemDiv = document.createElement('div');
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

	extrasDiv = document.createElement('div');
	extrasDiv.classList.add('popup-extras');

	wrapperDiv.append(contentDiv);
	wrapperDiv.append(extrasDiv);
	el.append(wrapperDiv);
};

const STEM_BASE_HEIGHT = 24;

/**
 * Shorten a long variable label while keeping its level suffix, e.g.
 * "Geopotential Height (500hPa)" -> "Geopotenti… (500hPa)".
 */
const truncateLabel = (label: string, max = 20): string => {
	if (label.length <= max) return label;
	const suffix = label.match(/\s*\(\d+\s*(?:m|cm|hPa)\)$/)?.[0] ?? '';
	const base = suffix ? label.slice(0, label.length - suffix.length) : label;
	const room = Math.max(max - suffix.length - 1, 4);
	if (base.length <= room + 1) return label;
	return base.slice(0, room).trimEnd() + '…' + suffix;
};

/**
 * Very short names for the secondary popup lines, keyed by the variable's
 * level-group prefix (or full id for level-less variables).
 */
const SHORT_LABELS: Record<string, string> = {
	cape: 'CAPE',
	cloud_cover: 'CC',
	cloud_cover_low: 'CC low',
	cloud_cover_mid: 'CC mid',
	cloud_cover_high: 'CC high',
	freezing_level_height: 'Frz lvl',
	geopotential_height: 'Z',
	precipitation: 'Precip',
	precipitation_probability: 'Prob',
	pressure_msl: 'MSLP',
	relative_humidity: 'RH',
	snowfall: 'Snow',
	temperature: 'T',
	total_column_integrated_water_vapour: 'TCWV',
	vertical_velocity: 'VV',
	wave_height: 'Waves',
	wind: 'Wind',
	wind_gusts_10m: 'Gusts'
};

/**
 * Compact label for a secondary source line: known variables shrink to an
 * abbreviation ("CC", "Precip"), pressure levels keep their number ("T 850",
 * "Z 500"), unknown ones fall back to a truncated full label.
 */
const shortLabel = (variable: string): string => {
	const level = variable.match(LEVEL_UNIT_REGEX)?.groups;
	const base = level ? (variable.match(LEVEL_PREFIX)?.groups?.prefix ?? variable) : variable;
	const short = SHORT_LABELS[base];
	if (!short) {
		const label = variableOptions.find((option) => option.value === variable)?.label ?? variable;
		return truncateLabel(label, 14);
	}
	return level?.unit === 'hPa' ? `${short} ${level.level}` : short;
};

/** Pressure/height context lines render even smaller than the other extras. */
const isPressureOrHeight = (variable: string): boolean =>
	variable === 'pressure_msl' || variable.startsWith('geopotential_height');

/**
 * Lift the popup box and lengthen the stem by the height of the extra source
 * lines, so the box never crowds the anchor dot.
 */
const adjustStemForExtras = (): void => {
	if (!wrapperDiv || !stemDiv || !extrasDiv) return;
	const extraHeight = extrasDiv.offsetHeight;
	wrapperDiv.style.transform = extraHeight ? `translateY(-${extraHeight}px)` : '';
	stemDiv.style.height = `${STEM_BASE_HEIGHT + extraHeight}px`;
};

/**
 * Values of the chart's secondary sources (everything except the primary
 * source shown in the coloured chip), one `label value unit` line each.
 * `seq` drops the DOM write when a newer update superseded this one.
 */
const updateExtraSources = async (
	coordinates: maplibregl.LngLat,
	primaryKey: string,
	seq: number
): Promise<void> => {
	if (!extrasDiv) return;

	// Keyed, not by variable: a same-variable source from another domain (EPS)
	// is a source of its own and still counts as extra.
	const activeUrls = getActiveOmUrls();
	const extras = get(chartSources).filter(
		(source) => sourceKey(source) !== primaryKey && activeUrls.has(sourceKey(source))
	);

	if (!extras.length) {
		extrasDiv.replaceChildren();
		adjustStemForExtras();
		return;
	}

	const omProtocolSettingsState = get(omProtocolSettings);
	const units = get(unitPreferences);

	const lines = await Promise.all(
		extras.map(async (source) => {
			try {
				const { value } = await getValueFromLatLong(
					coordinates.lat,
					coordinates.lng,
					activeUrls.get(sourceKey(source)) as string
				);
				const colorScale = getColorScale(
					source.variable,
					mode.current === 'dark',
					omProtocolSettingsState.colorScales
				);
				const label = shortLabel(source.variable);
				const unit = getDisplayUnit(colorScale.unit, units);
				if (!isFinite(value)) return { text: `${label}: –`, small: false, muted: true };
				const displayValue = convertValue(value, colorScale.unit, units);
				return {
					text: `${label}: ${displayValue.toFixed(1)} ${unit}`,
					small: isPressureOrHeight(source.variable),
					// A line whose value displays as zero is context, not signal
					muted: Math.round(Math.abs(displayValue) * 10) === 0
				};
			} catch {
				return undefined;
			}
		})
	);

	if (seq !== popupUpdateSeq) return;
	extrasDiv.replaceChildren(
		...lines
			.filter((line) => line !== undefined)
			.map((line) => {
				const lineDiv = document.createElement('div');
				lineDiv.classList.add('popup-extra-line');
				if (line.small) lineDiv.classList.add('popup-extra-line-sm');
				if (line.muted) lineDiv.classList.add('popup-extra-line-muted');
				lineDiv.innerText = line.text;
				return lineDiv;
			})
	);
	adjustStemForExtras();
};

// Monotonic token: only the latest updatePopupContent call may write the DOM,
// so a slow earlier lookup cannot overwrite a newer position's values.
let popupUpdateSeq = 0;

/** Update the popup content for the given coordinates without moving the marker. */
const updatePopupContent = async (coordinates: maplibregl.LngLat): Promise<void> => {
	if (!el || !contentDiv || !valueSpan || !unitSpan || !elevationSpan) return;

	const seq = ++popupUpdateSeq;
	const map = get(m);

	const elevation = map?.queryTerrainElevation(coordinates);
	const hasElevation = typeof elevation === 'number' && isFinite(elevation);

	// The primary source, not the `variable` store: an EPS source keeps its
	// domain, and its data is keyed `variable@domain`
	const primary = pickPrimarySource(get(activeChart));
	const primaryKey = sourceKey(primary);
	const activeUrl = getActiveOmUrls().get(primaryKey);
	if (!activeUrl) return;

	// Primary value and extra lines resolve concurrently
	const [{ value }] = await Promise.all([
		getValueFromLatLong(coordinates.lat, coordinates.lng, activeUrl),
		updateExtraSources(coordinates, primaryKey, seq)
	]);
	if (seq !== popupUpdateSeq) return;

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
		const colorScale = getColorScale(primary.variable, isDark, omProtocolSettingsState.colorScales);
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

// Double-tap-to-zoom and the tap-to-toggle-popup gesture overlap. On the first
// tap we must NOT immediately create the popup marker: it is a draggable marker
// that would swallow the second tap before MapLibre's double-tap zoom recognizes
// it. Instead we defer the toggle past the double-tap window
// (MapLibre's MAX_TAP_INTERVAL is 500ms) and skip it if a zoom started — a
// double-tap fires `zoomstart`.
const DOUBLE_TAP_WINDOW_MS = 400;

// While set (just after a zoom/double-tap began, or after a tap that closed
// the selection panel) taps are ignored, so such gestures never also toggle
// the popup, regardless of event ordering.
let suppressTapsUntil = 0;

/** Ignore popup-toggling taps for a moment (e.g. the tap closing the panel). */
export const suppressPopupTap = (ms: number = DOUBLE_TAP_WINDOW_MS): void => {
	suppressTapsUntil = Date.now() + ms;
};

export const addPopup = (): void => {
	const map = get(m);
	if (!map) return;

	map.on('mousemove', updatePopup);

	const togglePopupAt = async (lngLat: maplibregl.LngLat): Promise<void> => {
		if (!map || get(terraDrawActive)) return;

		switchPopupMode();

		if (get(popupMode) === null) {
			removePopup();
			return;
		}

		// Re-add mousemove listener (may have been removed by a previous removePopup)
		map.off('mousemove', updatePopup);
		map.on('mousemove', updatePopup);

		await renderPopup(lngLat);
	};

	let pendingTap: ReturnType<typeof setTimeout> | null = null;

	const cancelPendingTap = (): void => {
		if (pendingTap !== null) {
			clearTimeout(pendingTap);
			pendingTap = null;
		}
	};
	const onZoomOrDoubleClick = (): void => {
		suppressPopupTap();
		cancelPendingTap();
	};
	map.on('zoomstart', onZoomOrDoubleClick);
	map.on('dblclick', onZoomOrDoubleClick);

	map.on('click', (e: maplibregl.MapLayerMouseEvent) => {
		if (!map || get(terraDrawActive)) return;

		// When the popup is already active, toggle immediately.
		if (get(popupMode) !== null) {
			void togglePopupAt(e.lngLat);
			return;
		}

		if (Date.now() < suppressTapsUntil) return; // part of an in-progress zoom
		cancelPendingTap();
		const { lngLat } = e;
		pendingTap = setTimeout(() => {
			pendingTap = null;
			if (Date.now() < suppressTapsUntil) return; // a zoom slipped in while waiting
			void togglePopupAt(lngLat);
		}, DOUBLE_TAP_WINDOW_MS);
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
