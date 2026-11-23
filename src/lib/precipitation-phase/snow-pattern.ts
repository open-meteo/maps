import { PHASE_CONTOUR_HALO } from './phase-contour';

import type { Phase } from './model';

const REGIONAL_MAX_ZOOM = 6;
const REGIONAL_MIN_RUN = 9;
const STROKE_WIDTH = 3;

export const phaseTileHalo = (zoom: number, fill: boolean, contours: boolean) =>
	Math.max(
		fill && zoom <= REGIONAL_MAX_ZOOM ? REGIONAL_MIN_RUN - 1 : 0,
		contours ? PHASE_CONTOUR_HALO : 0
	);

const paintOver = (
	rgba: Uint8ClampedArray,
	offset: number,
	color: readonly [number, number, number],
	opacity: number
) => {
	const below = (rgba[offset + 3] / 255) * (1 - opacity);
	const alpha = opacity + below;
	for (let channel = 0; channel < 3; channel++) {
		rgba[offset + channel] = (color[channel] * opacity + rgba[offset + channel] * below) / alpha;
	}
	rgba[offset + 3] = 255 * alpha;
};

const TRANSITION_TINT: [number, number, number] = [174, 165, 200];
const ICE: [number, number, number] = [113, 159, 202];
const OUTLINE: [number, number, number] = [28, 54, 82];
const WHITE: [number, number, number] = [255, 255, 255];

type PhaseAt = (x: number, y: number) => Phase;

const hasContinuousSnow = (col: number, row: number, phaseAt: PhaseAt) => {
	let length = 1;
	for (const direction of [1, -1]) {
		for (let step = direction; length < REGIONAL_MIN_RUN; step += direction) {
			if (phaseAt(col + step, row - step) !== 'snow') break;
			length++;
		}
	}
	return length >= REGIONAL_MIN_RUN;
};

/** Regional tiles use wider spacing and a tint for patches too small to hatch. */
export const shadeSnow = (
	rgba: Uint8ClampedArray,
	size: number,
	zoom: number,
	phaseAt: PhaseAt
) => {
	const regional = zoom <= REGIONAL_MAX_ZOOM;
	const spacing = regional ? 32 : 16;
	const outlineOpacity = regional ? 0.66 : 0.48;
	for (let row = 0; row < size; row++) {
		// Stagger alternate rows of dots. Both periods divide the tile size.
		const dotShift = Math.floor(row / spacing) % 2 === 0 ? 0 : spacing / 2;
		const dotY = (row % spacing) - spacing / 2;
		for (let col = 0; col < size; col++) {
			const offset = (row * size + col) * 4;
			const phase = phaseAt(col, row);
			if (phase === 'transition') {
				// A light wash also identifies narrow areas between dots.
				paintOver(rgba, offset, TRANSITION_TINT, rgba[offset + 3] < 128 ? 0.24 : 0.13);
				if (Math.abs(dotY) <= 2) {
					const dotX = ((col + dotShift) % spacing) - spacing / 2;
					const radiusSquared = dotX * dotX + dotY * dotY;
					if (radiusSquared <= 4) paintOver(rgba, offset, WHITE, radiusSquared < 4 ? 0.85 : 0.4);
				}
				continue;
			}
			if (phase !== 'snow') continue;
			const band = (col + row) % spacing;
			const stroke = band < STROKE_WIDTH;
			const outline = band === STROKE_WIDTH || band === spacing - 1;
			const weakPrecipitation = rgba[offset + 3] < 128;
			if (!(regional || stroke || outline || weakPrecipitation)) continue;

			if (weakPrecipitation) paintOver(rgba, offset, ICE, rgba[offset + 3] === 0 ? 0.44 : 0.22);
			else if (regional) paintOver(rgba, offset, ICE, 0.12);

			if (!(stroke || outline) || (regional && !hasContinuousSnow(col, row, phaseAt))) continue;
			paintOver(rgba, offset, stroke ? WHITE : OUTLINE, stroke ? 0.92 : outlineOpacity);
		}
	}
};
