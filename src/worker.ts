import { hideZero, drawOnTiles } from '$lib/utils/variables';

import { DynamicProjection, ProjectionGrid, type Projection } from '$lib/utils/projection';

import Pbf from 'pbf';

import {
	tile2lat,
	tile2lon,
	rotatePoint,
	degreesToRadians,
	getIndexAndFractions
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

	const px = interpolator(
		values,
		ranges[1]['end'] - ranges[1]['start'],
		index,
		xFraction,
		yFraction
	);

	const direction = degreesToRadians(
		interpolator(directions, ranges[1]['end'] - ranges[1]['start'], index, xFraction, yFraction)
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
		const key = message.data.key;
		const x = message.data.x;
		const y = message.data.y;
		const z = message.data.z;
		const values = message.data.data.values;
		const ranges = message.data.ranges;

		const domain = message.data.domain;
		const variable = message.data.variable;

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

		const colorScale = getColorScale(message.data.variable);
		const interpolator = getInterpolator(colorScale);

		const extent = 4096;
		const layerName = 'contours';

		const tileLatMin = tile2lat(y + 1, z);
		const tileLatMax = tile2lat(y, z);
		const tileLonMin = tile2lon(x, z);
		const tileLonMax = tile2lon(x + 1, z);

		const nx = domain.grid.nx;
		const ny = domain.grid.ny;

		const dx = domain.grid.dx;
		const dy = domain.grid.dy;

		const lonMin = domain.grid.lonMin;
		const lonMax = domain.grid.lonMin + nx * dx;

		const latMin = domain.grid.latMin;
		const latMax = domain.grid.latMin + ny * dy;

		let coords = [];
		for (let i = 0; i < ny; i++) {
			const lat = latMin + dy * i;

			if (lat > tileLatMin && lat <= tileLatMax) {
				for (let j = 0; j < nx; j++) {
					const lon = lonMin + dx * j;

					if (lon > tileLonMin && lon <= tileLonMax) {
						const ind = j + i * nx;

						const px = values[ind];

						if (px > 1014.9 && px < 1015.1) {
							console.log(ind);
							coords.push([lon, lat]);
						}
					}
				}
			}
		}

		const level = 1015;
		// const coords = marchingSquares(values, level, x, y, z, domain, projectionGrid, ranges);
		console.log(coords);

		const pbf = new Pbf();

		const geom: number[] = [];
		let cursor: [number, number] = [0, 0];

		if (coords) {
			coords = coords.map((coord) => project([coord[0], coord[1]]));
			// MoveTo first point
			const [x0, y0] = coords[0] ? [coords[0][0], coords[0][1]] : [0, 0];
			geom.push(encodeCommand(1, 1)); // MoveTo
			geom.push(zigZag(x0 - cursor[0]));
			geom.push(zigZag(y0 - cursor[1]));
			cursor = [x0, y0];

			// // LineTo rest
			// for (let i = 1; i < coords.length; i++) {
			// 	const [xi1, yi1] = [coords[i][0], coords[i][1]];
			// 	const [xi2, yi2] = [coords[i][2], coords[i][3]];
			// 	geom.push(encodeCommand(1, 1)); // MoveTo
			// 	geom.push(zigZag(xi1 - cursor[0]));
			// 	geom.push(zigZag(yi1 - cursor[1]));
			// 	cursor = [xi1, yi1];
			// 	geom.push(encodeCommand(2, 1));
			// 	geom.push(zigZag(xi2 - cursor[0]));
			// 	geom.push(zigZag(yi2 - cursor[1]));
			// 	cursor = [xi2, yi2];
			// }

			// LineTo rest
			geom.push(encodeCommand(2, coords.length));
			for (let i = 1; i < coords.length; i++) {
				const [xi1, yi1] = [coords[i][0], coords[i][1]];

				geom.push(zigZag(xi1 - cursor[0]));
				geom.push(zigZag(yi1 - cursor[1]));
				cursor = [xi1, yi1];
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
		}

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

// Quick projection: lon/lat → extent (not perfect WebMercator, but enough for demo)
function project([lon, lat]: [number, number], extent = 4096): [number, number] {
	const x = Math.floor(((lon + 180) / 360) * extent);
	const y = Math.floor(
		((1 -
			Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) /
			2) *
			extent
	);
	return [x, y];
}
