import { hideZero, drawOnTiles } from '$lib/utils/variables';

import { DynamicProjection, ProjectionGrid, type Projection } from '$lib/utils/projection';

import { tile2lat, tile2lon, getIndexFromLatLong } from '$lib/utils/math';

import { getColorScale, getInterpolator } from '$lib/utils/color-scales';

import type { ColorScale, Domain, IndexAndFractions } from '$lib/types';

const TILE_SIZE = Number(import.meta.env.VITE_TILE_SIZE) * 2;
const OPACITY = Number(import.meta.env.VITE_TILE_OPACITY);

// const rotatePoint = (cx: number, cy: number, theta: number, x: number, y: number) => {
// 	let xt = Math.cos(theta) * (x - cx) - Math.sin(theta) * (y - cy) + cx;
// 	let yt = Math.sin(theta) * (x - cx) + Math.cos(theta) * (y - cy) + cy;

// 	return [xt, yt];
// };

// const drawArrow = (
// 	rgba: Uint8ClampedArray,
// 	iBase: number,
// 	jBase: number,
// 	x: number,
// 	y: number,
// 	z: number,
// 	nx: number,
// 	domain: Domain,
// 	projectionGrid: ProjectionGrid,
// 	values: TypedArray,
// 	directions: TypedArray,
// 	boxSize = TILE_SIZE / 8,
// 	iconPixelData: IconListPixels
// ): void => {
// 	const northArrow = iconPixelData['0'];

// 	let iCenter = iBase + Math.floor(boxSize / 2);
// 	let jCenter = jBase + Math.floor(boxSize / 2);

// 	const lat = tile2lat(y + iCenter / TILE_SIZE, z);
// 	const lon = tile2lon(x + jCenter / TILE_SIZE, z);

// 	const { index, xFraction, yFraction } = getIndexAndFractions(lat, lon, domain, projectionGrid);

// 	let px = interpolateLinear(values, nx, index, xFraction, yFraction);

// 	let direction = degreesToRadians(interpolateLinear(directions, nx, index, xFraction, yFraction));

// 	if (direction) {
// 		for (let i = 0; i < boxSize; i++) {
// 			for (let j = 0; j < boxSize; j++) {
// 				let ind = j + i * boxSize;
// 				let rotatedPoint = rotatePoint(
// 					Math.floor(boxSize / 2),
// 					Math.floor(boxSize / 2),
// 					-direction,
// 					i,
// 					j
// 				);
// 				let newI = Math.floor(rotatedPoint[0]);
// 				let newJ = Math.floor(rotatedPoint[1]);
// 				let indTile = jBase + newJ + (iBase + newI) * TILE_SIZE;

// 				if (northArrow[4 * ind + 3]) {
// 					rgba[4 * indTile] = 0;
// 					rgba[4 * indTile + 1] = 0;
// 					rgba[4 * indTile + 2] = 0;
// 					rgba[4 * indTile + 3] =
// 						northArrow[4 * ind + 3] * Math.min(((px - 2) / 200) * 50, 100) * (OPACITY / 50);
// 				}
// 			}
// 		}
// 	}
// };

const getColor = (colorScale: ColorScale, px: number): number[] => {
	return colorScale.colors[
		Math.min(
			colorScale.colors.length - 1,
			Math.max(0, Math.floor((px - colorScale.min) / colorScale.scalefactor))
		)
	];
};

const getOpacity = (v: string, px: number, dark: boolean): number => {
	if (v == 'cloud_cover' || v == 'thunderstorm_probability') {
		// scale opacity with percentage
		return 255 * (px ** 1.5 / 1000) * (OPACITY / 100);
	} else if (v.startsWith('wind')) {
		// scale opacity with wind values below 14kn
		return Math.min((px - 2) / 12, 1) * 255 * (OPACITY / 100);
	} else if (v.startsWith('precipitation')) {
		// scale opacity with precip values below 1.5mm
		return Math.min(px / 1.5, 1) * 255 * (OPACITY / 100);
	} else {
		// else set the opacity with env variable and deduct 20% for darkmode
		return 255 * (dark ? OPACITY / 100 - 0.2 : OPACITY / 100);
	}
};

const getIndexAndFractions = (
	lat: number,
	lon: number,
	domain: Domain,
	projectionGrid: ProjectionGrid | null,
	ranges = [
		{ start: 0, end: domain.grid.ny },
		{ start: 0, end: domain.grid.nx }
	]
) => {
	let indexObject: IndexAndFractions;
	if (domain.grid.projection && projectionGrid) {
		indexObject = projectionGrid.findPointInterpolated(lat, lon, ranges);
	} else {
		indexObject = getIndexFromLatLong(lat, lon, domain, ranges);
	}

	return (
		indexObject ?? {
			index: NaN,
			xFraction: 0,
			yFraction: 0
		}
	);
};

self.onmessage = async (message) => {
	if (message.data.type == 'GT') {
		const key = message.data.key;
		const x = message.data.x;
		const y = message.data.y;
		const z = message.data.z;
		const values = message.data.data.values;
		const ranges = message.data.ranges;

		const domain = message.data.domain;
		const variable = message.data.variable;
		const colorScale = getColorScale(message.data.variable);

		const pixels = TILE_SIZE * TILE_SIZE;
		const rgba = new Uint8ClampedArray(pixels * 4);
		const dark = message.data.dark;

		let projectionGrid = null;
		if (domain.grid.projection) {
			const projectionName = domain.grid.projection.name;
			const projection = new DynamicProjection(
				projectionName,
				domain.grid.projection
			) as Projection;
			projectionGrid = new ProjectionGrid(projection, domain.grid, ranges);
		}

		const interpolator = getInterpolator(colorScale);

		for (let i = 0; i < TILE_SIZE; i++) {
			const lat = tile2lat(y + i / TILE_SIZE, z);
			for (let j = 0; j < TILE_SIZE; j++) {
				const ind = j + i * TILE_SIZE;
				const lon = tile2lon(x + j / TILE_SIZE, z);

				const { index, xFraction, yFraction } = getIndexAndFractions(
					lat,
					lon,
					domain,
					projectionGrid,
					ranges
				);

				let px = interpolator(
					values,
					ranges[1]['end'] - ranges[1]['start'],
					index,
					xFraction,
					yFraction
				);

				if (hideZero.includes(variable.value)) {
					if (px < 0.25) {
						px = NaN;
					}
				}

				if (isNaN(px) || px === Infinity || variable.value === 'weather_code') {
					rgba[4 * ind] = 0;
					rgba[4 * ind + 1] = 0;
					rgba[4 * ind + 2] = 0;
					rgba[4 * ind + 3] = 0;
				} else {
					const color = getColor(colorScale, px);

					if (color) {
						rgba[4 * ind] = color[0];
						rgba[4 * ind + 1] = color[1];
						rgba[4 * ind + 2] = color[2];
						rgba[4 * ind + 3] = getOpacity(variable.value, px, dark);
					}
				}
			}
		}

		if (drawOnTiles.includes(variable.value)) {
			// const iconPixelData = message.data.iconPixelData;
			// let reg = new RegExp(/wind_(\d+)m/);
			// const matches = variable.value.match(reg);
			// if (matches) {
			// 	const boxSize = Math.floor(TILE_SIZE / 16);
			// 	for (let i = 0; i < TILE_SIZE; i += boxSize) {
			// 		for (let j = 0; j < TILE_SIZE; j += boxSize) {
			// 			drawArrow(
			// 				rgba,
			// 				i,
			// 				j,
			// 				x,
			// 				y,
			// 				z,
			// 				nx,
			// 				domain,
			// 				projectionGrid,
			// 				values,
			// 				directions,
			// 				boxSize,
			// 				iconPixelData
			// 			);
			// 		}
			// 	}
			// }
		}

		const tile = await createImageBitmap(new ImageData(rgba, TILE_SIZE, TILE_SIZE));

		postMessage({ type: 'RT', tile: tile, key: key });
		self.close();
	}
};
