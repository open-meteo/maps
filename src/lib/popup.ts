import { get } from 'svelte/store';

import {
	GridFactory,
	LEVEL_PREFIX,
	LEVEL_UNIT_REGEX,
	createClippingTester,
	getCachedResolvedClipping,
	getColor,
	getColorScale,
	getFallbackDomain,
	getValueFromLatLong,
	isSeamlessDomain,
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
import { defaultArrowStyle } from './chart-styles';
import { alphaOfCssColor, rescaleInto } from './color';
import { textWhite } from './helpers';
import { getActiveOmUrls } from './layers';
import { terraDrawActive } from './stores/clipping';
import { desktop, opacity } from './stores/preferences';

let el: HTMLDivElement | undefined;
let wrapperDiv: HTMLDivElement | undefined;
let contentDiv: HTMLDivElement | undefined;
let arrowSpan: HTMLSpanElement | undefined;
let arrowSvg: SVGSVGElement | undefined;
let arrowPath: SVGPathElement | undefined;
let valueSpan: HTMLSpanElement | undefined;
let unitSpan: HTMLSpanElement | undefined;
let elevationSpan: HTMLSpanElement | undefined;
let extrasDiv: HTMLDivElement | undefined;
let stemDiv: HTMLDivElement | undefined;

// Cached clipping tester — recomputed only when clippingOptions reference changes.
let cachedClippingOptionsRef: unknown = undefined;
let cachedClippingTester: ((lon: number, lat: number) => boolean) | undefined;

// ── Direction arrow ─────────────────────────────────────────────────────
// A miniature of the arrows layer: same geometry (fixed head, tail growing
// with the value) and the same value-driven encoding of tail length, opacity
// and line width. The layer's steps are smoothed into continuous ramps and
// its opacity range is lifted (see ARROW_OPACITY_RANGE), so the arrow grows
// and fades gradually while the popup moves and stays readable when weak.

/** On-screen box in px. Stroke widths are converted into these units. */
const ARROW_PX = 18;
/** Viewbox units per box, i.e. `size` in the arrows-layer geometry. */
const ARROW_UNITS = 100;
/** Head half-width and depth, as fractions of `size` in `generateArrows`. */
const HEAD_HALF = 13;
const HEAD_DEPTH = 22;

/**
 * Tail length as a fraction of the box, per speed. The anchors are the steps
 * `generateArrows` uses; values in between are interpolated.
 */
const ARROW_LENGTH_ANCHORS: [speed: number, length: number][] = [
	[0, 0.5],
	[1, 0.55],
	[2, 0.6],
	[3, 0.7],
	[5, 0.75],
	[10, 0.8],
	[20, 0.85]
];

/** Opacity and line width per speed, from the arrows layer's own style. */
const arrowStyleAnchors = (dark: boolean): [speed: number, alpha: number, width: number][] =>
	[...defaultArrowStyle.levels]
		.sort((a, b) => a.minSpeed - b.minSpeed)
		.map((level) => [
			level.minSpeed,
			alphaOfCssColor(dark ? level.darkColor : level.lightColor),
			level.width
		]);

/**
 * Opacity the arrow is drawn at. The layer's own alpha ramp bottoms out at
 * 0.2, which disappears on a glyph this small next to bold text, so its shape
 * is kept but remapped into a range that stays readable at low values.
 */
const ARROW_OPACITY_RANGE: [min: number, max: number] = [0.4, 1];

/**
 * Line width in px, likewise remapped: the layer's 1.5–2.8 px is drawn over a
 * ~20 px arrow on the map but looks heavy on this one.
 */
const ARROW_WIDTH_RANGE: [min: number, max: number] = [1.1, 2];

/** Piecewise-linear read of an anchor table, clamped outside its range. */
const rampAt = (anchors: number[][], speed: number, column: number): number => {
	const first = anchors[0];
	if (speed <= first[0]) return first[column];
	for (let i = 1; i < anchors.length; i++) {
		const [x1] = anchors[i];
		if (speed > x1) continue;
		const [x0] = anchors[i - 1];
		const t = x1 === x0 ? 1 : (speed - x0) / (x1 - x0);
		return anchors[i - 1][column] + t * (anchors[i][column] - anchors[i - 1][column]);
	}
	return anchors[anchors.length - 1][column];
};

/**
 * Read the layer ramp at `speed` and rescale it into `range`: the arrow keeps
 * the layer's progression from weak to strong values, at its own intensity.
 */
const rescaledRamp = (
	anchors: number[][],
	speed: number,
	column: number,
	range: [number, number]
): number =>
	rescaleInto(
		rampAt(anchors, speed, column),
		anchors.map((anchor) => anchor[column]),
		range
	);

interface ArrowPose {
	/** Continuous (unwrapped) degrees: see `arrowAngle`. */
	angle: number;
	length: number;
	opacity: number;
	width: number;
}

// Continuous (unwrapped) arrow angle in degrees: easing toward the raw value
// would spin the long way round whenever the direction crosses 0/360.
let arrowAngle = 0;

/** Currently drawn pose, the latest sample, and the pending frame. */
let arrowPose: ArrowPose | undefined;
let arrowTarget: ArrowPose | undefined;
let arrowFrame = 0;

/** Share of the remaining distance covered per frame. */
const ARROW_EASE = 0.25;

/**
 * Redraw the arrow as a single path, rotation baked into the coordinates.
 *
 * Everything here used to be CSS transforms with a transition, which looked
 * pixelated: the browser is free to rasterize a transformed element once and
 * reuse that bitmap, and the tail in particular was a unit-length line scaled
 * up ~70x. Recomputing the geometry costs nothing at this size and always
 * renders at the display's full resolution.
 */
const drawArrow = (pose: ArrowPose): void => {
	if (!arrowSvg || !arrowPath) return;

	const centre = ARROW_UNITS / 2;
	const radians = (pose.angle * Math.PI) / 180;
	const sin = Math.sin(radians);
	const cos = Math.cos(radians);
	// Rotated around the centre, clockwise like the layer's `rotatePoint`
	const at = (x: number, y: number): string =>
		`${(centre + x * cos - y * sin).toFixed(2)} ${(centre + x * sin + y * cos).toFixed(2)}`;

	const half = pose.length / 2;
	const barb = HEAD_DEPTH - half;
	arrowPath.setAttribute(
		'd',
		`M${at(0, half)}L${at(0, -half)}M${at(-HEAD_HALF, barb)}L${at(0, -half)}L${at(HEAD_HALF, barb)}`
	);
	arrowSvg.style.opacity = String(pose.opacity);
	// Widths are px; the viewbox is ARROW_PX wide on screen
	arrowSvg.style.strokeWidth = String(pose.width * (ARROW_UNITS / ARROW_PX));
};

/** Ease the drawn pose toward the latest sample until it lands on it. */
const stepArrow = (): void => {
	arrowFrame = 0;
	if (!arrowPose || !arrowTarget) return;

	const from = arrowPose;
	const to = arrowTarget;
	const next: ArrowPose = {
		angle: from.angle + (to.angle - from.angle) * ARROW_EASE,
		length: from.length + (to.length - from.length) * ARROW_EASE,
		opacity: from.opacity + (to.opacity - from.opacity) * ARROW_EASE,
		width: from.width + (to.width - from.width) * ARROW_EASE
	};
	// Below a tenth of a degree / a hundredth of a unit nothing is visible
	const settled =
		Math.abs(to.angle - next.angle) < 0.1 &&
		Math.abs(to.length - next.length) < 0.01 &&
		Math.abs(to.opacity - next.opacity) < 0.005 &&
		Math.abs(to.width - next.width) < 0.01;

	arrowPose = settled ? { ...to } : next;
	drawArrow(arrowPose);
	if (!settled) arrowFrame = requestAnimationFrame(stepArrow);
};

/**
 * Point the popup arrow the way the flow goes and size it for `speed` (the
 * raw value, in the same unit the arrows layer thresholds use). `direction`
 * is the meteorological direction the flow comes *from*, matching the map
 * arrows (which rotate by direction + 180). Undefined/NaN hides the arrow.
 */
const setArrow = (direction: number | undefined, speed: number): void => {
	if (!arrowSpan || !arrowSvg || !arrowPath) return;
	if (direction === undefined || !isFinite(direction)) {
		if (arrowFrame) cancelAnimationFrame(arrowFrame);
		arrowFrame = 0;
		// Dropped so the next sample starts from it rather than easing out of
		// a pose that has since gone stale
		arrowPose = undefined;
		arrowSpan.classList.remove('popup-arrow-visible');
		return;
	}

	// Shortest way round from the angle currently targeted
	arrowAngle += ((((direction + 180 - arrowAngle) % 360) + 540) % 360) - 180;

	const style = arrowStyleAnchors(mode.current === 'dark');
	arrowTarget = {
		angle: arrowAngle,
		length: rampAt(ARROW_LENGTH_ANCHORS, speed, 1) * ARROW_UNITS,
		opacity: rescaledRamp(style, speed, 1, ARROW_OPACITY_RANGE),
		width: rescaledRamp(style, speed, 2, ARROW_WIDTH_RANGE)
	};

	if (!arrowPose) {
		// First sample since the arrow was hidden: land on it, don't ease in
		arrowPose = { ...arrowTarget };
		drawArrow(arrowPose);
		arrowSpan.classList.add('popup-arrow-visible');
		return;
	}
	if (!arrowFrame) arrowFrame = requestAnimationFrame(stepArrow);
};

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

	// Points where the flow goes, like the map arrows; hidden for variables
	// without direction data. `drawArrow` writes the whole shape into the path
	// on every frame, so nothing here is positioned by CSS.
	arrowSpan = document.createElement('span');
	arrowSpan.classList.add('popup-arrow');
	arrowSpan.innerHTML =
		`<svg viewBox="0 0 ${ARROW_UNITS} ${ARROW_UNITS}" fill="none" stroke="currentColor" ` +
		'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
		'<path class="popup-arrow-path" /></svg>';
	arrowSvg = arrowSpan.querySelector('svg') ?? undefined;
	arrowPath = arrowSpan.querySelector('.popup-arrow-path') ?? undefined;

	valueSpan = document.createElement('span');
	valueSpan.classList.add('popup-value');
	unitSpan = document.createElement('span');
	unitSpan.classList.add('popup-unit');
	elevationSpan = document.createElement('span');
	elevationSpan.classList.add('popup-elevation');

	contentDiv.append(arrowSpan);
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

/**
 * Value and direction at a point for the primary source. For a seamless
 * composite the sub-layers are tried finest-first — states are stored under
 * the concrete domain keys, not the seamless URL key — mirroring how the
 * protocol composites pixels (first finite sub-layer wins).
 */
const getPrimaryValue = async (
	coordinates: maplibregl.LngLat,
	activeUrl: string
): Promise<{ value: number; direction?: number }> => {
	const domain = get(selectedDomain);
	if (isSeamlessDomain(domain)) {
		for (const layer of domain.layers) {
			const subLayerUrl = activeUrl.replace(
				`/data_spatial/${domain.value}/`,
				`/data_spatial/${layer.domainValue}/`
			);
			try {
				const result = await getValueFromLatLong(coordinates.lat, coordinates.lng, subLayerUrl);
				if (isFinite(result.value)) return result;
			} catch {
				// Sub-layer state not found (tile not yet loaded), try next
			}
		}
		return { value: NaN };
	}
	return await getValueFromLatLong(coordinates.lat, coordinates.lng, activeUrl);
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
	const [{ value, direction }] = await Promise.all([
		getPrimaryValue(coordinates, activeUrl),
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
				setArrow(undefined, 0);
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
		setArrow(direction, value);
		valueSpan.innerText = displayValue.toFixed(1);
		unitSpan.innerText = getDisplayUnit(colorScale.unit, units);
		elevationSpan.innerText = hasElevation ? `${Math.round(elevation)}m` : '';
		elevationSpan.style.color = textWhite(color, isDark) ? 'white' : 'black';
	} else {
		contentDiv.style.backgroundColor = '';
		contentDiv.style.color = '';
		setArrow(undefined, 0);

		const concreteDomain = getFallbackDomain(
			get(selectedDomain),
			get(omProtocolSettings).domainOptions
		);
		let insideDomain = false;
		if (concreteDomain) {
			const [minLon, minLat, maxLon, maxLat] = GridFactory.create(concreteDomain.grid).getBounds();
			insideDomain =
				coordinates.lat >= minLat &&
				coordinates.lat <= maxLat &&
				coordinates.lng >= minLon &&
				coordinates.lng <= maxLon;
		}

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
