import { PHASE_CONTOUR_HALO } from './phase-contour';

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

const ICE: [number, number, number] = [113, 159, 202];
const OUTLINE: [number, number, number] = [28, 54, 82];
const WHITE: [number, number, number] = [255, 255, 255];

const hasContinuousSnow = (col: number, row: number, isSnow: (x: number, y: number) => boolean) => {
	let length = 1;
	for (let step = 1; length < REGIONAL_MIN_RUN && isSnow(col + step, row - step); step++) {
		length++;
	}
	for (let step = 1; length < REGIONAL_MIN_RUN && isSnow(col - step, row + step); step++) {
		length++;
	}
	return length >= REGIONAL_MIN_RUN;
};

/** Regional tiles use wider spacing and a tint for patches too small to hatch. */
export const shadeSnow = (
	rgba: Uint8ClampedArray,
	size: number,
	zoom: number,
	isSnow: (x: number, y: number) => boolean
) => {
	const regional = zoom <= REGIONAL_MAX_ZOOM;
	const spacing = regional ? 32 : 16;
	const outlineOpacity = regional ? 0.66 : 0.48;
	for (let row = 0; row < size; row++) {
		for (let col = 0; col < size; col++) {
			const offset = (row * size + col) * 4;
			// Spacings divide the tile size, so stripes cross tile edges at the same angle.
			const band = (col + row) % spacing;
			const stroke = band < STROKE_WIDTH;
			const outline = band === STROKE_WIDTH || band === spacing - 1;
			const weakPrecipitation = rgba[offset + 3] < 128;
			if (!(regional || stroke || outline || weakPrecipitation) || !isSnow(col, row)) continue;

			if (weakPrecipitation) paintOver(rgba, offset, ICE, rgba[offset + 3] === 0 ? 0.44 : 0.22);
			else if (regional) paintOver(rgba, offset, ICE, 0.12);

			if (!(stroke || outline) || (regional && !hasContinuousSnow(col, row, isSnow))) continue;
			paintOver(rgba, offset, stroke ? WHITE : OUTLINE, stroke ? 0.92 : outlineOpacity);
		}
	}
};
