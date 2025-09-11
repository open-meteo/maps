import type { DimensionRange, Domain } from '$lib/types';

import { tile2lat, tile2lon, getIndexAndFractions } from '$lib/utils/math';

import type { TypedArray } from '@openmeteo/file-reader';

import type { ProjectionGrid } from './projection';

// prettier-ignore
export const edgeTable = [
	 [],			    // 0
	 [[3, 0]],		 // 1
	 [[0, 1]],               // 2
	 [[3, 1]],               // 3
	 [[1, 2]],               // 4
	 [[3, 0], [1, 2]],    // 5
	 [[0, 1], [1, 2]],    // 6
	 [[3, 2]],               // 7
	 [[2, 3]],               // 8
	 [[0, 2], [2, 3]],     // 9
	 [[1, 3], [2, 3]],     // 10
	 [[0, 3]],               // 11
	 [[1, 3]],               // 12
	 [[0, 1], [1, 3]],     // 13
	 [[0, 3], [1, 2]],     // 14
	 []                         // 15
];

/**
 * Intersects a level `T` with a line segment defined by two nodes.
 *
 * @param {number} v0   value at the first node
 * @param {number} v1   value at the second node
 * @param {number} t0   x (or y) coordinate of the first node
 * @param {number} t1   coordinate of the second node
 * @param {number} T    the contour threshold
 * @returns {number} world coordinate of the intersection
 */
function interpolate(v0: number, v1: number, t0: number, t1: number, T: number): number {
	if (v0 === v1) return (t0 + t1) * 0.5; // degenerate cell
	return t0 + ((T - v0) * (t1 - t0)) / (v1 - v0);
}

export function marchingSquares(
	values: TypedArray,
	level: number,
	x: number,
	y: number,
	z: number,
	domain: Domain,
	projectionGrid: ProjectionGrid | null,
	ranges: DimensionRange[]
): number[][] {
	const segments = [];

	const tileLatMin = tile2lat(y + 1, z);
	const tileLatMax = tile2lat(y, z);
	const tileLonMin = tile2lon(x, z);
	const tileLonMax = tile2lon(x + 1, z);

	const nx = domain.grid.nx;
	const ny = domain.grid.ny;

	const dx = domain.grid.dx;
	const dy = domain.grid.dy;

	const oX = tile2lon(x, z);
	const oY = tile2lat(y + 1, z);

	const lonMin = domain.grid.lonMin;
	const latMin = domain.grid.latMin;

	const indicis = [];
	const indicisFound = [];
	for (let i = 0; i < ny; i++) {
		const lat = latMin + dy * i;
		if (lat > tileLatMin && lat <= tileLatMax) {
			for (let j = 0; j < nx; j++) {
				const lon = lonMin + dx * j;
				if (lon > tileLonMin && lon <= tileLonMax) {
					const index = j + i * nx;

					indicis.push(index);

					const v0 = values[index]; // (i,   j)
					const v1 = values[index + 1]; // (i, j+1)
					const v2 = values[index + nx]; // (i+1, j)
					const v3 = values[index + nx + 1]; // (i+1, j+1)

					// code
					const c = (v0 > level) | ((v1 > level) << 1) | ((v2 > level) << 2) | ((v3 > level) << 3);

					if (c === 0 || c === 15) continue; // no contour inside this cell

					indicisFound.push(index);

					// ----- corners of gridcell in world coordinates ------------------------
					const x0 = lon - dx / 2;
					const y0 = lat - dy / 2;
					const x1 = lon + dx / 2;
					const y1 = lat + dy / 2;

					// ----- fetch the edges that need intersections ----------
					const edges = edgeTable[c];

					// compute the *intersection* points on those edges
					const pts = [];
					for (const [ea, eb] of edges) {
						// map edge number → (node index, value, coordinate)
						// Edge 0 – (0,1)
						// Edge 1 – (1,2)
						// Edge 2 – (2,3)
						// Edge 3 – (3,0)
						let a = {};
						let b = {};

						switch (ea) {
							case 0:
								a = { x: x0, y: y0, v: v0 };
								break;
							case 1:
								a = { x: x1, y: y0, v: v1 };
								break;
							case 2:
								a = { x: x1, y: y1, v: v2 };
								break;
							case 3:
								a = { x: x0, y: y1, v: v3 };
								break;
						}
						switch (eb) {
							case 0:
								b = { x: x0, y: y0, v: v0 };
								break;
							case 1:
								b = { x: x1, y: y0, v: v1 };
								break;
							case 2:
								b = { x: x1, y: y1, v: v2 };
								break;
							case 3:
								b = { x: x0, y: y1, v: v3 };
								break;
						}

						const ix = interpolate(a.v, b.v, a.x, b.x, level);
						const iy = interpolate(a.v, b.v, a.y, b.y, level);
						pts.push(project([ix, iy]));
					}

					if (pts.length === 2) {
						segments.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
					} else if (pts.length === 4) {
						segments.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
						segments.push([pts[2][0], pts[2][1], pts[3][0], pts[3][1]]);
					}
				}
			}
		}
	}

	return segments;
}

function project([lat, lon]: [number, number], extent = 4096): [number, number] {
	const x = Math.floor(((lon + 180) / 360) * extent);
	const y = Math.floor(
		((1 -
			Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) /
			2) *
			extent
	);
	return [x, y];
}
