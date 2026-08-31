/**
 * The arrow and wind-barb shapes, as polylines in a 100-unit box, mirroring
 * the geometry `generateArrows` and `generateWindBarbs` write into vector
 * tiles. Kept here so the sprites drawn for the icon renderer, and the
 * previews in the settings pane, come from one description of the shape.
 *
 * Both shapes point up (north) at rest and are rotated by the renderer.
 */

/** Viewbox units per shape, i.e. `size` in the tile generators. */
export const SHAPE_UNITS = 100;

export const MS_TO_KNOTS = 1.9438445;

// ── Arrow, from `generateArrows` ────────────────────────────────────────

/** Head half-width and depth, as fractions of `size` in the generator. */
const HEAD_HALF = 13;
const HEAD_DEPTH = 22;

/** Total arrow length per speed (m/s), the generator's own steps. */
export const arrowLength = (speed: number): number => {
	if (speed < 1) return 0.5;
	if (speed < 2) return 0.55;
	if (speed < 3) return 0.6;
	if (speed < 5) return 0.7;
	if (speed < 10) return 0.75;
	if (speed < 20) return 0.8;
	return 0.85;
};

/** Arrow pointing where the flow goes, as polylines in the box. */
export const arrowShape = (speed: number): number[][][] => {
	const centre = SHAPE_UNITS / 2;
	const half = (arrowLength(speed) * SHAPE_UNITS) / 2;
	const barb = HEAD_DEPTH - half;
	return [
		[
			[centre, centre + half],
			[centre, centre - half]
		],
		[
			[centre - HEAD_HALF, centre + barb],
			[centre, centre - half],
			[centre + HEAD_HALF, centre + barb]
		]
	];
};

// ── Wind barb, from `generateWindBarbs` ─────────────────────────────────

const CIRCLE_KNOTS = 0.5;
const STAFF_HALF = 0.42;
const SLOT_STEP = 0.16;
const BARB_SPAN = 0.64;
const BARB_LENGTH = 0.26;
const BARB_LEAN = 0.13;
const CALM_RADIUS = 0.21;
const CALM_INNER_RADIUS = 0.14;
const CELL_BUDGET = 0.47;
const FIT = Math.min(1, CELL_BUDGET / Math.hypot(STAFF_HALF + BARB_LEAN, BARB_LENGTH));

/** Pennants, full barbs and half barbs for a speed, rounded to 5 kt. */
export const barbCounts = (knots: number): { pennants: number; full: number; half: number } => {
	let remaining = Math.round(knots / 5) * 5;
	const pennants = Math.floor(remaining / 50);
	remaining -= pennants * 50;
	const full = Math.floor(remaining / 10);
	remaining -= full * 10;
	return { pennants, full, half: remaining >= 5 ? 1 : 0 };
};

export interface BarbShape {
	/** Staff, barbs and calm rings. */
	lines: number[][][];
	/** Pennant triangles, drawn solid. */
	pennants: number[][][];
}

/** Wind barb with its staff pointing into the wind, as polylines in the box. */
export const barbShape = (knots: number): BarbShape => {
	const centre = SHAPE_UNITS / 2;
	const at = (across: number, along: number): number[] => [
		centre + across * FIT * SHAPE_UNITS,
		centre + along * FIT * SHAPE_UNITS
	];

	const lines: number[][][] = [];
	const pennants: number[][][] = [];

	if (knots < CIRCLE_KNOTS) {
		const corners = 12;
		for (const radius of [CALM_RADIUS, CALM_INNER_RADIUS]) {
			const ring: number[][] = [];
			for (let i = 0; i <= corners; i++) {
				const angle = (i / corners) * 2 * Math.PI;
				ring.push(at(radius * Math.sin(angle), radius * Math.cos(angle)));
			}
			lines.push(ring);
		}
		return { lines, pennants };
	}

	lines.push([at(0, STAFF_HALF), at(0, -STAFF_HALF)]);

	const counts = barbCounts(knots);
	const lonely = counts.half === 1 && counts.pennants === 0 && counts.full === 0;
	const slots = counts.pennants * 2 + counts.full + counts.half + (lonely ? 1 : 0);
	const step = Math.min(SLOT_STEP, BARB_SPAN / Math.max(1, slots));

	let along = -STAFF_HALF + (lonely ? step : 0);
	for (let i = 0; i < counts.pennants; i++) {
		pennants.push([at(0, along), at(BARB_LENGTH, along - BARB_LEAN), at(0, along + 2 * step)]);
		along += 2 * step;
	}
	for (let i = 0; i < counts.full; i++) {
		lines.push([at(0, along), at(BARB_LENGTH, along - BARB_LEAN)]);
		along += step;
	}
	if (counts.half) {
		lines.push([at(0, along), at(BARB_LENGTH / 2, along - BARB_LEAN / 2)]);
	}

	return { lines, pennants };
};

/** An SVG path for a shape's polylines, for previews outside the map. */
export const shapePath = (polylines: number[][][]): string =>
	polylines
		.map(
			(line) =>
				'M' + line.map(([x, y]) => `${Number(x.toFixed(1))} ${Number(y.toFixed(1))}`).join('L')
		)
		.join('');
