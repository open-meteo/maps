/**
 * Orange outline of the grid cell under the popup: the model's own cell whose
 * node the popup value is read from. Cells fade in as the popup enters them
 * and out as it leaves, so a popup following the mouse trails a short wake of
 * fading cells instead of a box jumping from cell to cell.
 */
import { get } from 'svelte/store';

import { map as m } from '#lib/stores/map.js';

import { BEFORE_LAYER_VECTOR } from '#lib/constants.js';

import type * as maplibregl from 'maplibre-gl';

type Ring = Array<[number, number]>;

const SOURCE_ID = 'popupCellSource';
const LINE_LAYER_ID = 'popup-cell-line';
/** The colour of the grid-points layer, which marks the same grid. */
const CELL_COLOR = 'orange';
/** Outline only: the raster colour inside the cell is the value itself. */
const LINE_WIDTH = 2;
/** Share of the remaining distance covered per frame, like the popup arrow. */
const CELL_EASE = 0.2;

interface FadingCell {
	ring: Ring;
	opacity: number;
	/** 1 while the popup is in the cell, 0 once it has left. */
	target: 0 | 1;
}

let cells: FadingCell[] = [];
let frame = 0;

const sameRing = (a: Ring, b: Ring): boolean =>
	a.length === b.length && a.every(([lon, lat], i) => lon === b[i][0] && lat === b[i][1]);

/**
 * Add the source and layer when the style lacks them: on first use, and again
 * after a basemap or theme switch rebuilt the style. False while a new style
 * is still loading and cannot take sources yet.
 */
const ensureLayers = (map: maplibregl.Map): boolean => {
	if (map.getSource(SOURCE_ID)) return true;
	try {
		map.addSource(SOURCE_ID, {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] }
		});
	} catch {
		return false;
	}
	// Under the labels, above the data layers, like the seamless borders
	const before = map.getLayer(BEFORE_LAYER_VECTOR) ? BEFORE_LAYER_VECTOR : undefined;
	map.addLayer(
		{
			id: LINE_LAYER_ID,
			type: 'line',
			source: SOURCE_ID,
			paint: {
				'line-color': CELL_COLOR,
				'line-width': LINE_WIDTH,
				'line-opacity': ['get', 'opacity']
			}
		},
		before
	);
	return true;
};

/** Ease every cell toward its target opacity and redraw, until all have landed. */
const stepCells = (): void => {
	frame = 0;
	const map = get(m);
	if (!map) return;
	if (!ensureLayers(map)) {
		frame = requestAnimationFrame(stepCells);
		return;
	}

	let settled = true;
	for (const cell of cells) {
		const next = cell.opacity + (cell.target - cell.opacity) * CELL_EASE;
		// Below a hundredth nothing is visible
		cell.opacity = Math.abs(cell.target - next) < 0.01 ? cell.target : next;
		if (cell.opacity !== cell.target) settled = false;
	}
	cells = cells.filter((cell) => cell.opacity > 0);

	(map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData({
		type: 'FeatureCollection',
		features: cells.map((cell) => ({
			type: 'Feature',
			geometry: { type: 'Polygon', coordinates: [cell.ring] },
			properties: { opacity: cell.opacity }
		}))
	});
	if (!settled) frame = requestAnimationFrame(stepCells);
};

/**
 * Show the cell outlined by `ring` (a closed `[lon, lat]` ring), fading out any
 * other cell still shown; undefined fades them all out.
 */
export const showPopupCell = (ring: Ring | undefined): void => {
	for (const cell of cells) cell.target = ring && sameRing(cell.ring, ring) ? 1 : 0;
	if (ring && !cells.some((cell) => cell.target === 1)) {
		cells.push({ ring, opacity: 0, target: 1 });
	}
	if (cells.length && !frame) frame = requestAnimationFrame(stepCells);
};
