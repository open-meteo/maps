/**
 * Configurable style definitions for contour lines and wind arrows.
 *
 * Each style is an array of "levels" that map data values to visual
 * properties (line color, width). The defaults match the original
 * hardcoded MapLibre expressions. Custom overrides are stored per-variable
 * in the chart-styles store.
 */

import type * as maplibregl from 'maplibre-gl';

// ── Contour styles ──────────────────────────────────────────────────────

export interface ContourLevel {
	/** Values where `value % modulo === 0` get this style. 0 = fallback ("other"). */
	modulo: number;
	label: string;
	lightColor: string;
	darkColor: string;
	width: number;
}

export interface ContourStyle {
	levels: ContourLevel[];
}

/** Default contour style — weakest (fallback) first, strongest last. */
export const defaultContourStyle: ContourStyle = {
	levels: [
		{ modulo: 0, label: 'Other', lightColor: 'rgba(0,0,0,0.3)', darkColor: 'rgba(255,255,255,0.5)', width: 1 },
		{ modulo: 10, label: '×10', lightColor: 'rgba(0,0,0,0.4)', darkColor: 'rgba(255,255,255,0.6)', width: 2 },
		{ modulo: 50, label: '×50', lightColor: 'rgba(0,0,0,0.5)', darkColor: 'rgba(255,255,255,0.7)', width: 2.5 },
		{ modulo: 100, label: '×100', lightColor: 'rgba(0,0,0,0.6)', darkColor: 'rgba(255,255,255,0.8)', width: 3 }
	]
};

// ── Arrow styles ────────────────────────────────────────────────────────

export interface ArrowLevel {
	/** Values above this speed get this style. Matched highest-first. */
	minSpeed: number;
	label: string;
	lightColor: string;
	darkColor: string;
	width: number;
}

export interface ArrowStyle {
	levels: ArrowLevel[];
}

/** Default arrow style — weakest (lowest threshold) first, strongest last. */
export const defaultArrowStyle: ArrowStyle = {
	levels: [
		{ minSpeed: 0, label: '≤2', lightColor: 'rgba(0,0,0,0.2)', darkColor: 'rgba(255,255,255,0.2)', width: 1.5 },
		{ minSpeed: 2, label: '>2', lightColor: 'rgba(0,0,0,0.3)', darkColor: 'rgba(255,255,255,0.3)', width: 1.6 },
		{ minSpeed: 3, label: '>3', lightColor: 'rgba(0,0,0,0.4)', darkColor: 'rgba(255,255,255,0.4)', width: 1.6 },
		{ minSpeed: 4, label: '>4', lightColor: 'rgba(0,0,0,0.5)', darkColor: 'rgba(255,255,255,0.5)', width: 1.8 },
		{ minSpeed: 5, label: '>5', lightColor: 'rgba(0,0,0,0.6)', darkColor: 'rgba(255,255,255,0.6)', width: 2 },
		{ minSpeed: 10, label: '>10', lightColor: 'rgba(0,0,0,0.7)', darkColor: 'rgba(255,255,255,0.7)', width: 2.2 },
		{ minSpeed: 20, label: '>20', lightColor: 'rgba(0,0,0,0.7)', darkColor: 'rgba(255,255,255,0.7)', width: 2.8 }
	]
};

// ── RGBA helpers ────────────────────────────────────────────────────────

export function parseRgbaOpacity(rgba: string): number {
	const parts = rgba.match(/[\d.]+/g);
	if (!parts || parts.length < 4) return 1;
	return parseFloat(parts[3]);
}

export function setRgbaOpacity(rgba: string, newOpacity: number): string {
	const parts = rgba.match(/[\d.]+/g);
	if (!parts || parts.length < 3) return rgba;
	return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${newOpacity})`;
}

// ── MapLibre expression builders ────────────────────────────────────────

/**
 * Build a contour line-color expression from a ContourStyle.
 * Checks highest modulo first (outermost case), falls through to "other" (modulo 0).
 */
export function buildContourColorExpr(
	style: ContourStyle,
	dark: boolean
): maplibregl.ExpressionSpecification {
	const sorted = [...style.levels].sort((a, b) => b.modulo - a.modulo);
	const fallback = sorted.find((l) => l.modulo === 0);
	const conditions = sorted.filter((l) => l.modulo > 0);

	let expr: maplibregl.ExpressionSpecification = [
		'literal',
		dark ? (fallback?.darkColor ?? 'transparent') : (fallback?.lightColor ?? 'transparent')
	];

	// Build inside-out: lowest modulo is innermost, highest is outermost (first checked)
	for (const level of [...conditions].reverse()) {
		expr = [
			'case',
			['boolean', ['==', ['%', ['to-number', ['get', 'value']], level.modulo], 0], false],
			dark ? level.darkColor : level.lightColor,
			expr
		];
	}
	return expr;
}

/** Build a contour line-width expression from a ContourStyle. */
export function buildContourWidthExpr(style: ContourStyle): maplibregl.ExpressionSpecification {
	const sorted = [...style.levels].sort((a, b) => b.modulo - a.modulo);
	const fallback = sorted.find((l) => l.modulo === 0);
	const conditions = sorted.filter((l) => l.modulo > 0);

	let expr: maplibregl.ExpressionSpecification = ['literal', fallback?.width ?? 1];

	for (const level of [...conditions].reverse()) {
		expr = [
			'case',
			['boolean', ['==', ['%', ['to-number', ['get', 'value']], level.modulo], 0], false],
			level.width,
			expr
		];
	}
	return expr;
}

/**
 * Build an arrow line-color expression from an ArrowStyle.
 * Checks highest threshold first, falls through to the base (minSpeed 0).
 */
export function buildArrowColorExpr(
	style: ArrowStyle,
	dark: boolean
): maplibregl.ExpressionSpecification {
	const sorted = [...style.levels].sort((a, b) => a.minSpeed - b.minSpeed);
	const fallback = sorted[0];

	let expr: maplibregl.ExpressionSpecification = [
		'literal',
		dark ? (fallback?.darkColor ?? 'transparent') : (fallback?.lightColor ?? 'transparent')
	];

	const conditions = sorted.filter((l) => l.minSpeed > 0);
	for (const level of conditions) {
		expr = [
			'case',
			['boolean', ['>', ['to-number', ['get', 'value']], level.minSpeed], false],
			dark ? level.darkColor : level.lightColor,
			expr
		];
	}
	return expr;
}

/** Build an arrow line-width expression from an ArrowStyle. */
export function buildArrowWidthExpr(style: ArrowStyle): maplibregl.ExpressionSpecification {
	const sorted = [...style.levels].sort((a, b) => a.minSpeed - b.minSpeed);
	const fallback = sorted[0];

	let expr: maplibregl.ExpressionSpecification = ['literal', fallback?.width ?? 1.5];

	const conditions = sorted.filter((l) => l.minSpeed > 0);
	for (const level of conditions) {
		expr = [
			'case',
			['boolean', ['>', ['to-number', ['get', 'value']], level.minSpeed], false],
			level.width,
			expr
		];
	}
	return expr;
}
