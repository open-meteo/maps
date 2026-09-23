/**
 * Configurable style definitions for contour lines and wind arrows.
 *
 * Each style is an array of "levels" that map data values to visual
 * properties (line color, width). The defaults match the original
 * hardcoded MapLibre expressions; here they are evaluated per feature by
 * the style function of the OpenLayers vector tile layer.
 */

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
		{
			modulo: 0,
			label: 'Other',
			lightColor: 'rgba(0,0,0,0.3)',
			darkColor: 'rgba(255,255,255,0.5)',
			width: 1
		},
		{
			modulo: 10,
			label: '×10',
			lightColor: 'rgba(0,0,0,0.4)',
			darkColor: 'rgba(255,255,255,0.6)',
			width: 2
		},
		{
			modulo: 50,
			label: '×50',
			lightColor: 'rgba(0,0,0,0.5)',
			darkColor: 'rgba(255,255,255,0.7)',
			width: 2.5
		},
		{
			modulo: 100,
			label: '×100',
			lightColor: 'rgba(0,0,0,0.6)',
			darkColor: 'rgba(255,255,255,0.8)',
			width: 3
		}
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
		{
			minSpeed: 0,
			label: '≤2',
			lightColor: 'rgba(0,0,0,0.2)',
			darkColor: 'rgba(255,255,255,0.2)',
			width: 1.5
		},
		{
			minSpeed: 2,
			label: '>2',
			lightColor: 'rgba(0,0,0,0.3)',
			darkColor: 'rgba(255,255,255,0.3)',
			width: 1.6
		},
		{
			minSpeed: 3,
			label: '>3',
			lightColor: 'rgba(0,0,0,0.4)',
			darkColor: 'rgba(255,255,255,0.4)',
			width: 1.6
		},
		{
			minSpeed: 4,
			label: '>4',
			lightColor: 'rgba(0,0,0,0.5)',
			darkColor: 'rgba(255,255,255,0.5)',
			width: 1.8
		},
		{
			minSpeed: 5,
			label: '>5',
			lightColor: 'rgba(0,0,0,0.6)',
			darkColor: 'rgba(255,255,255,0.6)',
			width: 2
		},
		{
			minSpeed: 10,
			label: '>10',
			lightColor: 'rgba(0,0,0,0.7)',
			darkColor: 'rgba(255,255,255,0.7)',
			width: 2.2
		},
		{
			minSpeed: 20,
			label: '>20',
			lightColor: 'rgba(0,0,0,0.7)',
			darkColor: 'rgba(255,255,255,0.7)',
			width: 2.8
		}
	]
};

// ── Per-feature evaluation ──────────────────────────────────────────────

export interface LineStyle {
	color: string;
	width: number;
}

/**
 * Contour line style for a value: the highest modulo that divides the value
 * wins, falling through to "other" (modulo 0).
 */
export function contourStyleFor(value: number, style: ContourStyle, dark: boolean): LineStyle {
	const sorted = [...style.levels].sort((a, b) => b.modulo - a.modulo);
	const level =
		sorted.find((l) => l.modulo > 0 && value % l.modulo === 0) ??
		sorted.find((l) => l.modulo === 0);
	if (!level) return { color: 'transparent', width: 1 };
	return { color: dark ? level.darkColor : level.lightColor, width: level.width };
}

/**
 * Arrow line style for a speed: the highest threshold the speed exceeds wins,
 * falling through to the base level (minSpeed 0).
 */
export function arrowStyleFor(value: number, style: ArrowStyle, dark: boolean): LineStyle {
	const sorted = [...style.levels].sort((a, b) => a.minSpeed - b.minSpeed);
	let level = sorted[0];
	for (const candidate of sorted) {
		if (candidate.minSpeed > 0 && value > candidate.minSpeed) level = candidate;
	}
	if (!level) return { color: 'transparent', width: 1.5 };
	return { color: dark ? level.darkColor : level.lightColor, width: level.width };
}

/**
 * The level a speed falls in, matching how the per-feature styles above
 * cascade: the highest level whose threshold the speed is past.
 */
export function arrowLevelFor(style: ArrowStyle, speed: number): ArrowLevel {
	const sorted = [...style.levels].sort((a, b) => a.minSpeed - b.minSpeed);
	let level = sorted[0];
	for (const candidate of sorted) if (speed > candidate.minSpeed) level = candidate;
	return level;
}

/**
 * Opacity range wind barbs are drawn over. They follow the arrow ramp's
 * progression, but a barb already spells its speed out in pennants and barbs,
 * so fading a slow one to the arrows' 0.2 only makes it unreadable.
 */
export const BARB_OPACITY_RANGE: [min: number, max: number] = [0.45, 0.85];
