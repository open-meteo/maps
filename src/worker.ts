import { hideZero, drawOnTiles } from '$lib/utils/variables';

import { DynamicProjection, ProjectionGrid, type Projection } from '$lib/utils/projections';

import Pbf from 'pbf';

import {
	tile2lat,
	tile2lon,
	rotatePoint,
	degreesToRadians,
	getIndexAndFractions,
	lat2tile,
	lon2tile
} from '$lib/utils/math';

import { getColor, getColorScale, getInterpolator, getOpacity } from '$lib/utils/color-scales';

import type { Domain, Variable, Interpolator, DimensionRange } from '$lib/types';

import type { IconListPixels } from '$lib/utils/icons';

import type { TypedArray } from '@openmeteo/file-reader';
import { marchingSquares } from '$lib/utils/march';
import { VectorTile, VectorTileLayer } from '@mapbox/vector-tile';

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
		const margin = 256;
		const layerName = 'contours';

		const pbf = new Pbf();

		if (key.includes('grid=true')) {
			const features = [];

			for (let j = 0; j < domain.grid.ny; j++) {
				const lat = domain.grid.latMin + domain.grid.dy * j;
				// if (lat > minLatTile && lat < maxLatTile) {
				const worldPy = Math.floor(lat2tile(lat, z) * extent);
				const py = worldPy - y * extent;
				if (py > -margin && py <= extent + margin) {
					for (let i = 0; i < domain.grid.nx; i++) {
						const lon = domain.grid.lonMin + domain.grid.dx * i;
						// if (lon > minLonTile && lon < maxLonTile) {
						const worldPx = Math.floor(lon2tile(lon, z) * extent);
						const px = worldPx - x * extent;
						if (px > -margin && px <= extent + margin) {
							const index = j * domain.grid.nx + i;
							const value = values[index];
							if (!isNaN(value)) {
								features.push({
									id: index,
									type: 1, // 1 = Point
									properties: {
										value: values[index]
									},
									geom: [
										command(1, 1), // MoveTo
										zigzag(px),
										zigzag(py)
									]
								});
							}
						}
					}
				}
			}

			// write Layer
			pbf.writeMessage(3, writeLayer, {
				name: 'grid',
				extent,
				features: features
			});
		} else {
			const features = [];
			for (let level = 950; level < 1050; level = level + 2) {
				let cursor: [number, number] = [0, 0];

				const segments = marchingSquares(values, level, z, y, x, domain);

				if (segments.length > 0) {
					const geom: number[] = [];
					// move to first point in segments
					let xt0, yt0, xt1, yt1;
					geom.push(command(1, 1)); // MoveTo
					[xt0, yt0] = segments[0];
					geom.push(zigzag(xt0 - cursor[0]));
					geom.push(zigzag(yt0 - cursor[1]));
					cursor = [xt0, yt0];

					for (const s of segments) {
						[xt0, yt0, xt1, yt1] = s;

						// if (Math.abs(xt1 - cursor[0]) > 10 || Math.abs(yt1 - cursor[1]) > 10) {
						geom.push(command(1, 1)); // MoveTo
						geom.push(zigzag(xt0 - cursor[0]));
						geom.push(zigzag(yt0 - cursor[1]));
						cursor = [xt0, yt0];
						//}

						geom.push(command(2, 1)); // LineTo
						geom.push(zigzag(xt1 - cursor[0]));
						geom.push(zigzag(yt1 - cursor[1]));
						cursor = [xt1, yt1];
					}
					geom.push(command(7, 1)); // closepath

					features.push({
						id: level,
						type: 2, // 2 = LineString
						properties: {
							lw: level % 100 === 0 ? 2 : level % 50 === 0 ? 1.5 : level % 10 === 0 ? 1 : 0.5,
							pressure: level
						},
						geom
					});
				}
			}

			// write Layer
			pbf.writeMessage(3, writeLayer, {
				name: layerName,
				extent,
				features: features
			});
		}

		postMessage({ type: 'returnArrayBuffer', tile: pbf.finish(), key: key });
	}
};

interface Feature {
	id: number;
	type: number;
	properties: {};
	geom: number[];
}

interface Context {
	feature: Feature | undefined;
	keys: string[];
	values: any[];
	keycache: {};
	valuecache: {};
}

// writer for VectorTileLayer
function writeLayer(layer: any, pbf: Pbf) {
	pbf.writeVarintField(15, layer.version || 2);
	// name
	pbf.writeStringField(1, layer.name);
	// extent
	pbf.writeVarintField(5, layer.extent);

	const context: Context = {
		feature: undefined,
		keys: [],
		values: [],
		keycache: {},
		valuecache: {}
	};

	// for (let i = 0; i < layer.length; i++) {
	// 	context.feature = layer.feature(i);
	// 	pbf.writeMessage(2, writeFeature, context);
	// }

	layer.features.forEach((feat: Feature) => {
		context.feature = feat;
		pbf.writeMessage(2, writeFeature, context);
	});

	const keys = context.keys;
	for (let i = 0; i < keys.length; i++) {
		pbf.writeStringField(3, keys[i]);
	}

	const values = context.values;
	for (let i = 0; i < values.length; i++) {
		pbf.writeMessage(4, writeValue, values[i]);
	}
}

function writeFeature(context: Context, pbf: Pbf) {
	const feature = context.feature;

	if (feature.id !== undefined) {
		pbf.writeVarintField(1, feature.id);
	}

	pbf.writeMessage(2, writeProperties, context);
	pbf.writeVarintField(3, feature.type);
	pbf.writePackedVarint(4, feature.geom);
}

// // writer for VectorTileFeature
// function writeFeature(feat: any, pbf: Pbf) {
// 	pbf.writeVarintField(1, feat.id); // id

// 	// feature tags
// 	pbf.writePackedVarint(2, [0, Number(feat.id) % 10 === 0 ? 0 : 1]);

// 	pbf.writeVarintField(3, feat.type); // type (2 = LineString)
// 	pbf.writePackedVarint(4, feat.geom); // geometry
// }

function command(cmd: number, length: number) {
	return (length << 3) + (cmd & 0x7);
}

function zigzag(n: number) {
	return (n << 1) ^ (n >> 31);
}

function writeGeometry(feature, pbf: Pbf) {
	const geometry = feature.loadGeometry();
	const type = feature.type;
	let x = 0;
	let y = 0;
	const rings = geometry.length;
	for (let r = 0; r < rings; r++) {
		const ring = geometry[r];
		let count = 1;
		if (type === 1) {
			count = ring.length;
		}
		pbf.writeVarint(command(1, count)); // moveto
		// do not write polygon closing path as lineto
		const lineCount = type === 3 ? ring.length - 1 : ring.length;
		for (let i = 0; i < lineCount; i++) {
			if (i === 1 && type !== 1) {
				pbf.writeVarint(command(2, lineCount - 1)); // lineto
			}
			const dx = ring[i].x - x;
			const dy = ring[i].y - y;
			pbf.writeVarint(zigzag(dx));
			pbf.writeVarint(zigzag(dy));
			x += dx;
			y += dy;
		}
		if (type === 3) {
			pbf.writeVarint(command(7, 1)); // closepath
		}
	}
}

function writeProperties(context, pbf: Pbf) {
	const feature = context.feature;
	const keys = context.keys;
	const values = context.values;
	const keycache = context.keycache;
	const valuecache = context.valuecache;

	for (const key in feature.properties) {
		let value = feature.properties[key];

		let keyIndex = keycache[key];
		if (value === null) continue; // don't encode null value properties

		if (typeof keyIndex === 'undefined') {
			keys.push(key);
			keyIndex = keys.length - 1;
			keycache[key] = keyIndex;
		}
		pbf.writeVarint(keyIndex);

		const type = typeof value;
		if (type !== 'string' && type !== 'boolean' && type !== 'number') {
			value = JSON.stringify(value);
		}
		const valueKey = type + ':' + value;
		let valueIndex = valuecache[valueKey];
		if (typeof valueIndex === 'undefined') {
			values.push(value);
			valueIndex = values.length - 1;
			valuecache[valueKey] = valueIndex;
		}
		pbf.writeVarint(valueIndex);
	}
}

function writeValue(value: any, pbf: Pbf) {
	const type = typeof value;
	if (type === 'string') {
		pbf.writeStringField(1, value);
	} else if (type === 'boolean') {
		pbf.writeBooleanField(7, value);
	} else if (type === 'number') {
		if (value % 1 !== 0) {
			pbf.writeDoubleField(3, value);
		} else if (value < 0) {
			pbf.writeSVarintField(6, value);
		} else {
			pbf.writeVarintField(5, value);
		}
	}
}
