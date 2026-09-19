import { get } from 'svelte/store';

import {
	GridFactory,
	createClippingTester,
	getCachedResolvedClipping,
	getColor,
	getColorScale,
	getValueFromLatLong
} from '@openmeteo/weather-map-layer';
import { mode } from 'mode-watcher';
import Overlay from 'ol/Overlay';
import { toLonLat } from 'ol/proj';

import { map as m, popup as p, popupMode } from '$lib/stores/map';
import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
import { convertValue, getDisplayUnit, unitPreferences } from '$lib/stores/units';
import { selectedDomain, variable as v } from '$lib/stores/variables';

import { defaultArrowStyle } from './chart-styles';
import { textWhite } from './helpers';
import { getActiveOmUrl } from './layers';
import { terraDrawActive } from './stores/clipping';
import { desktop, opacity } from './stores/preferences';

import type MapBrowserEvent from 'ol/MapBrowserEvent';
import type { Coordinate } from 'ol/coordinate';

let el: HTMLDivElement | undefined;
let wrapperDiv: HTMLDivElement | undefined;
let contentDiv: HTMLDivElement | undefined;
let arrowSpan: HTMLSpanElement | undefined;
let arrowSvg: SVGSVGElement | undefined;
let arrowPath: SVGPathElement | undefined;
let valueSpan: HTMLSpanElement | undefined;
let unitSpan: HTMLSpanElement | undefined;
let elevationSpan: HTMLSpanElement | undefined;

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

/** Alpha of an `rgb()`/`rgba()` string; 1 when it carries no alpha. */
const alphaOf = (color: string): number => {
	const parts = color.slice(color.indexOf('(') + 1, color.lastIndexOf(')')).split(',');
	return parts.length > 3 ? Number(parts[3]) : 1;
};

/** Opacity and line width per speed, from the arrows layer's own style. */
const arrowStyleAnchors = (dark: boolean): [speed: number, alpha: number, width: number][] =>
	[...defaultArrowStyle.levels]
		.sort((a, b) => a.minSpeed - b.minSpeed)
		.map((level) => [
			level.minSpeed,
			alphaOf(dark ? level.darkColor : level.lightColor),
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
	[min, max]: [number, number]
): number => {
	const values = anchors.map((anchor) => anchor[column]);
	const weakest = Math.min(...values);
	const strongest = Math.max(...values);
	const t =
		strongest === weakest ? 1 : (rampAt(anchors, speed, column) - weakest) / (strongest - weakest);
	return min + t * (max - min);
};

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

	// The map is always north-up and flat, so the compass heading is the
	// on-screen angle
	const target = direction + 180;
	// Shortest way round from the angle currently targeted
	arrowAngle += ((((target - arrowAngle) % 360) + 540) % 360) - 180;

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

	wrapperDiv.append(contentDiv);
	el.append(wrapperDiv);
};

/** Update the popup content for the given map coordinate without moving the marker. */
const updatePopupContent = async (coordinate: Coordinate): Promise<void> => {
	if (!el || !contentDiv || !valueSpan || !unitSpan || !elevationSpan) return;

	const [lng, lat] = toLonLat(coordinate);
	const coordinates = { lng, lat };

	// No terrain in OpenLayers, so no elevation to show
	const hasElevation = false;
	const elevation = 0;

	const activeUrl = getActiveOmUrl();
	if (!activeUrl) return;

	const { value, direction } = await getValueFromLatLong(
		coordinates.lat,
		coordinates.lng,
		activeUrl
	);

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
		const colorScale = getColorScale(get(v), isDark, omProtocolSettingsState.colorScales);
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

/**
 * OpenLayers overlays cannot be dragged: in drag mode the element itself
 * follows the pointer and re-samples the value along the way.
 */
const makeDraggable = (overlay: Overlay, element: HTMLElement): void => {
	let dragging = false;
	element.addEventListener('pointerdown', (e) => {
		if (get(popupMode) !== 'drag') return;
		dragging = true;
		element.setPointerCapture(e.pointerId);
		e.stopPropagation();
	});
	element.addEventListener('pointermove', (e) => {
		const map = get(m);
		if (!dragging || !map) return;
		const rect = map.getTargetElement().getBoundingClientRect();
		const coordinate = map.getCoordinateFromPixel([e.clientX - rect.left, e.clientY - rect.top]);
		overlay.setPosition(coordinate);
		void updatePopupContent(coordinate);
	});
	const stop = () => {
		dragging = false;
	};
	element.addEventListener('pointerup', stop);
	element.addEventListener('pointercancel', stop);
};

/** Ensure the marker exists, place it at `coordinate`, and update its content. */
export const renderPopup = async (coordinate: Coordinate): Promise<void> => {
	const map = get(m);
	if (!get(popupMode) || !map) return;

	if (!el || !contentDiv || !valueSpan || !unitSpan || !elevationSpan) initPopupDiv();
	if (!el || !contentDiv || !valueSpan || !unitSpan || !elevationSpan) return;

	let popup = get(p);
	if (!popup) {
		// Centred on the point like a MapLibre marker; the map keeps receiving
		// the pointer events it needs for the follow mode
		popup = new Overlay({ element: el, positioning: 'center-center', stopEvent: false });
		popup.setPosition(coordinate);
		map.addOverlay(popup);
		p.set(popup);
		makeDraggable(popup, el);
	} else {
		popup.setPosition(coordinate);
		if (!popup.getMap()) map.addOverlay(popup);
	}

	await updatePopupContent(coordinate);
};

export const refreshPopup = async (): Promise<void> => {
	const popup = get(p);
	const coordinate = popup?.getPosition();
	if (coordinate) await updatePopupContent(coordinate);
};

const updatePopup = async (e: MapBrowserEvent): Promise<void> => {
	if (get(popupMode) === 'follow' && !get(terraDrawActive)) {
		const popup = get(p);
		if (popup) {
			popup.setPosition(e.coordinate);
		}
		await renderPopup(e.coordinate);
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
// that would swallow the second tap before OpenLayers' double-tap zoom recognizes
// it. Instead we defer the toggle past the double-tap window
// (OpenLayers' double click interval is 250ms) and skip it if a zoom started — a
// double-tap fires `zoomstart`.
const DOUBLE_TAP_WINDOW_MS = 400;

export const addPopup = (): void => {
	const map = get(m);
	if (!map) return;

	map.on('pointermove', updatePopup);

	const togglePopupAt = async (coordinate: Coordinate): Promise<void> => {
		if (!map || get(terraDrawActive)) return;

		switchPopupMode();

		if (get(popupMode) === null) {
			removePopup();
			return;
		}

		// Re-add the pointermove listener (may have been removed by a previous removePopup)
		map.un('pointermove', updatePopup);
		map.on('pointermove', updatePopup);

		await renderPopup(coordinate);
	};

	let pendingTap: ReturnType<typeof setTimeout> | null = null;
	// While set (just after a zoom/double-tap began) taps are ignored, so a
	// double-tap zoom never also toggles the popup, regardless of event ordering.
	let suppressTapsUntil = 0;

	const cancelPendingTap = (): void => {
		if (pendingTap !== null) {
			clearTimeout(pendingTap);
			pendingTap = null;
		}
	};
	const onZoomOrDoubleClick = (): void => {
		suppressTapsUntil = Date.now() + DOUBLE_TAP_WINDOW_MS;
		cancelPendingTap();
	};
	// A zoom shows as a resolution change of the view
	map.getView().on('change:resolution', onZoomOrDoubleClick);
	map.on('dblclick', onZoomOrDoubleClick);

	map.on('click', (e: MapBrowserEvent) => {
		if (!map || get(terraDrawActive)) return;

		// When the popup is already active, toggle immediately.
		if (get(popupMode) !== null) {
			void togglePopupAt(e.coordinate);
			return;
		}

		if (Date.now() < suppressTapsUntil) return; // part of an in-progress zoom
		cancelPendingTap();
		const { coordinate } = e;
		pendingTap = setTimeout(() => {
			pendingTap = null;
			if (Date.now() < suppressTapsUntil) return; // a zoom slipped in while waiting
			void togglePopupAt(coordinate);
		}, DOUBLE_TAP_WINDOW_MS);
	});
};

export const removePopup = (): void => {
	const map = get(m);
	if (!map) return;

	map.un('pointermove', updatePopup);

	const popup = get(p);
	if (popup) map.removeOverlay(popup);
	p.set(undefined);
};
