import { hideZero, drawOnTiles } from '$lib/utils/variables';

import { DynamicProjection, ProjectionGrid, type Projection } from '$lib/utils/projections';

import Pbf from 'pbf';

import {
	tile2lat,
	tile2lon,
	rotatePoint,
	degreesToRadians,
	getIndexAndFractions,
	latLon2Tile
} from '$lib/utils/math';

import { getColor, getColorScale, getInterpolator, getOpacity } from '$lib/utils/color-scales';

import type { Domain, Variable, Interpolator, DimensionRange } from '$lib/types';

import type { IconListPixels } from '$lib/utils/icons';

import type { TypedArray } from '@openmeteo/file-reader';
import { marchingSquares } from '$lib/utils/march';

const TILE_SIZE = Number(import.meta.env.VITE_TILE_SIZE) * 2;
const OPACITY = Number(import.meta.env.VITE_TILE_OPACITY);

const drawArrow = (
	rgba: Uint8ClampedArray,
	iBase: number,
	jBase: number,
	x: number,
	y: number,
	z: number,
	ranges: DimensionRange[],
	domain: Domain,
	variable: Variable,
	projectionGrid: ProjectionGrid | null,
	values: TypedArray,
	directions: TypedArray,
	boxSize = TILE_SIZE / 8,
	iconPixelData: IconListPixels,
	interpolator: Interpolator
): void => {
	const northArrow = iconPixelData['0'];

	const iCenter = iBase + Math.floor(boxSize / 2);
	const jCenter = jBase + Math.floor(boxSize / 2);

	const lat = tile2lat(y + iCenter / TILE_SIZE, z);
	const lon = tile2lon(x + jCenter / TILE_SIZE, z);

	const { index, xFraction, yFraction } = getIndexAndFractions(
		lat,
		lon,
		domain,
		projectionGrid,
		ranges
	);

	const px = interpolator(values as Float32Array, index, xFraction, yFraction, ranges);

	const direction = degreesToRadians(
		interpolator(directions as Float32Array, index, xFraction, yFraction, ranges)
	);

	if (direction) {
		for (let i = 0; i < boxSize; i++) {
			for (let j = 0; j < boxSize; j++) {
				const ind = j + i * boxSize;
				const rotatedPoint = rotatePoint(
					Math.floor(boxSize / 2),
					Math.floor(boxSize / 2),
					-direction,
					i,
					j
				);
				const newI = Math.floor(rotatedPoint[0]);
				const newJ = Math.floor(rotatedPoint[1]);
				const indTile = jBase + newJ + (iBase + newI) * TILE_SIZE;

				let opacityValue;

				if (variable.value.startsWith('wind')) {
					opacityValue = Math.min(((px - 2) / 200) * 50, 100);
				} else {
					opacityValue = 0.8;
				}

				if (northArrow[4 * ind + 3]) {
					rgba[4 * indTile] = 0;
					rgba[4 * indTile + 1] = 0;
					rgba[4 * indTile + 2] = 0;
					rgba[4 * indTile + 3] = northArrow[4 * ind + 3] * opacityValue * (OPACITY / 50);
				}
			}
		}
	}
};

self.onmessage = async (message) => {
	if (message.data.type == 'getImage') {
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

				let px = interpolator(values as Float32Array, index, xFraction, yFraction, ranges);

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

		if (
			(variable.value.startsWith('wave') && !variable.value.includes('_period')) ||
			(variable.value.startsWith('wind') &&
				!variable.value.includes('_gusts') &&
				!variable.value.includes('_wave')) ||
			drawOnTiles.includes(variable.value)
		) {
			if (variable.value.startsWith('wave') || variable.value.startsWith('wind')) {
				const iconPixelData = message.data.iconPixelData;
				const directions = message.data.data.directions;

				const boxSize = Math.floor(TILE_SIZE / 16);
				for (let i = 0; i < TILE_SIZE; i += boxSize) {
					for (let j = 0; j < TILE_SIZE; j += boxSize) {
						drawArrow(
							rgba,
							i,
							j,
							x,
							y,
							z,
							ranges,
							domain,
							variable,
							projectionGrid,
							values,
							directions,
							boxSize,
							iconPixelData,
							interpolator
						);
					}
				}
			}
		}

		const tile = await createImageBitmap(new ImageData(rgba, TILE_SIZE, TILE_SIZE));

		postMessage({ type: 'returnImage', tile: tile, key: key });
	} else if (message.data.type == 'getArrayBuffer') {
		const x = message.data.x;
		const y = message.data.y;
		const z = message.data.z;
		const key = message.data.key;
		const values = message.data.data.values;
		const domain = message.data.domain;

		const extent = 4096;
		const layerName = 'contours';

		const level = 1000;

		const pbf = new Pbf();
		const geom: number[] = [];
		let cursor: [number, number] = [0, 0];

		const nx = domain.grid.nx;
		const ny = domain.grid.ny;

		const dx = domain.grid.dx;
		const dy = domain.grid.dy;

		const latMin = domain.grid.latMin;
		const lonMin = domain.grid.lonMin;

		const tileSize = 4096;
		const coords = [];
		for (let j = 0; j < nx; j++) {
			const lon = lonMin + dx * j;

			const worldPx = lon2tile(lon, z) * tileSize;
			const px = worldPx - x * tileSize;

			if (px > 0 && px <= tileSize) {
				for (let i = 0; i < ny; i++) {
					const lat = latMin + dy * i;

					const worldPy = lat2tile(lat, z) * tileSize;
					const py = worldPy - y * tileSize;
					if (py > 0 && py <= tileSize) {
						const index = i * nx + j;

						const v = values[index]; // (i, j)  west‑south

						if (v > level - 0.005 && v < level + 0.005) {
							coords.push([px, py]);
							continue;
						} else {
							continue;
						}
					}
				}
			}
		}

		// const [coords, gridPoints] = marchingSquares(values, level, x, y, z, domain);

		// MoveTo first point
		geom.push(encodeCommand(1, 1)); // MoveTo
		geom.push(zigZag(0));
		geom.push(zigZag(0));
		cursor = [0, 0];

		geom.push(encodeCommand(2, 4)); // LineTo
		geom.push(zigZag(4096 - cursor[0]));
		geom.push(zigZag(0 - cursor[1]));
		cursor = [4096, 0];

		geom.push(zigZag(4096 - cursor[0]));
		geom.push(zigZag(4096 - cursor[1]));
		cursor = [4096, 4096];

		geom.push(zigZag(0 - cursor[0]));
		geom.push(zigZag(4096 - cursor[1]));
		cursor = [0, 4096];

		geom.push(zigZag(0 - cursor[0]));
		geom.push(zigZag(0 - cursor[1]));
		cursor = [0, 0];

		let xt0, yt0, xt1, yt1;

		const testCoords = [
			[7.5, 62],
			[7.5, 50.5],
			[-2, 50.5],
			[-2, 62]
		];
		// const testCoords = [
		// 	[71.6, -50.7],
		// 	[71.6, -47.8],
		// 	[67.25, -47.8],
		// 	[67.25, -50.7]
		// ];

		geom.push(encodeCommand(1, 1)); // MoveTo
		[xt0, yt0] = testCoords[testCoords.length - 1];
		[xt0, yt0] = latLon2Tile(z, x, y, yt0, xt0, 4096);
		geom.push(zigZag(xt0 - cursor[0]));
		geom.push(zigZag(yt0 - cursor[1]));
		cursor = [xt0, yt0];
		for (const c of testCoords) {
			[xt0, yt0] = c;

			[xt0, yt0] = latLon2Tile(z, x, y, yt0, xt0, 4096);

			geom.push(encodeCommand(2, 1)); // LineTo
			geom.push(zigZag(xt0 - cursor[0]));
			geom.push(zigZag(yt0 - cursor[1]));
			cursor = [xt0, yt0];
		}

		// if (gridPoints.length > 0) {
		// 	geom.push(encodeCommand(1, 1)); // MoveTo
		// 	[xt0, yt0] = gridPoints[gridPoints.length - 1];

		// 	geom.push(zigZag(xt0 - cursor[0]));
		// 	geom.push(zigZag(yt0 - cursor[1]));
		// 	cursor = [xt0, yt0];
		// 	for (const c of gridPoints) {
		// 		[xt0, yt0] = c;

		// 		geom.push(encodeCommand(2, 1)); // LineTo
		// 		geom.push(zigZag(xt0 - cursor[0]));
		// 		geom.push(zigZag(yt0 - cursor[1]));
		// 		cursor = [xt0, yt0];
		// 	}
		// }

		if (coords.length > 0) {
			geom.push(encodeCommand(1, 1)); // MoveTo
			[xt0, yt0] = coords[0];
			geom.push(zigZag(xt0 - cursor[0]));
			geom.push(zigZag(yt0 - cursor[1]));
			cursor = [xt0, yt0];

			// geom.push(encodeCommand(2, coords.length - 1)); // LineTo
			for (const c of coords) {
				// [xt0, yt0, xt1, yt1] = c;
				[xt0, yt0] = c;

				// // geom.push(encodeCommand(1, 1)); // MoveTo
				// geom.push(zigZag(xt0 - cursor[0]));
				// geom.push(zigZag(yt0 - cursor[1]));
				// cursor = [xt0, yt0];

				// // geom.push(encodeCommand(2, 1)); // LineTo
				// geom.push(zigZag(xt1 - cursor[0]));
				// geom.push(zigZag(yt1 - cursor[1]));
				// cursor = [xt1, yt1];

				// Single point
				geom.push(encodeCommand(2, 1)); // LineTo
				geom.push(zigZag(xt0 - cursor[0]));
				geom.push(zigZag(yt0 - cursor[1]));
				cursor = [xt0, yt0];
			}
		}

		// write Layer
		pbf.writeMessage(3, writeLayer, {
			name: layerName,
			extent,
			features: [
				{
					id: 1,
					type: 2, // 2 = LineString
					geom
				}
			]
		});

		postMessage({ type: 'returnArrayBuffer', tile: pbf.finish(), key: key });
	}
};

// writer for VectorTileLayer
function writeLayer(layer: any, pbf: Pbf) {
	// name
	pbf.writeStringField(1, layer.name);
	// features
	layer.features.forEach((feat: any) => {
		pbf.writeMessage(2, writeFeature, feat);
	});
	// extent
	pbf.writeVarintField(5, layer.extent);
}

// writer for VectorTileFeature
function writeFeature(feat: any, pbf: Pbf) {
	pbf.writeVarintField(1, feat.id); // id
	pbf.writeVarintField(3, feat.type); // type (2 = LineString)
	pbf.writePackedVarint(4, feat.geom); // geometry
}

// Encode geometry commands per MVT spec
function encodeCommand(id: number, count: number) {
	return (count << 3) | id;
}
function zigZag(n: number) {
	return (n << 1) ^ (n >> 31);
}
