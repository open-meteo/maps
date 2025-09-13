import type { Domain } from '$lib/types';

import { lon2tile, lat2tile, latLon2Tile } from '$lib/utils/math';

import type { TypedArray } from '@openmeteo/file-reader';

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
function interpolate(
	v0: number | bigint,
	v1: number | bigint,
	t0: number,
	t1: number,
	T: number
): number {
	if (v0 === v1) return (t0 + t1) * 0.5; // degenerate cell
	return t0 + ((T - Number(v0)) * (t1 - t0)) / (Number(v1) - Number(v0));

	// t = (isolevel - valueAtVertexA) / (valueAtVertexB - valueAtVertexA);
	// pointOnEdge = vertexA + t * (vertexB - vertexA);
}

export function marchingSquares(
	values: TypedArray,
	level: number,
	x: number,
	y: number,
	z: number,
	domain: Domain
): number[][] {
	const segments = [];

	const nx = domain.grid.nx;
	const ny = domain.grid.ny;

	const dx = domain.grid.dx;
	const dy = domain.grid.dy;

	const latMin = domain.grid.latMin;
	const lonMin = domain.grid.lonMin;

	const tileSize = 4096;
	const margin = 256;
	const gridPoints = [];
	for (let i = 0; i < ny; i++) {
		const worldPy = Math.floor(lat2tile(latMin + dy * i, z) * tileSize);
		const py = worldPy - y * tileSize;
		if (py > -margin && py <= tileSize + margin) {
			for (let j = 0; j < nx; j++) {
				const worldPx = Math.floor(lon2tile(lonMin + dx * j, z) * tileSize);
				const px = worldPx - x * tileSize;

				if (px > -margin && px <= tileSize + margin) {
					const index = i * nx + j;

					const v0 = values[index]; // (i, j)  west‑south
					const v1 = values[index + 1]; // (i, j+1)  east‑south
					const v2 = values[index + nx]; //  (i+1, j) west‑north
					const v3 = values[index + nx + 1]; // (i+1, j+1) east‑north

					// code
					const c =
						(v0 > level ? 1 : 0) |
						((v1 > level ? 1 : 0) << 1) |
						((v2 > level ? 1 : 0) << 2) |
						((v3 > level ? 1 : 0) << 3);

					if (c === 0 || c === 15) continue; // no contour inside this cell

					// ----- corners of 4 gridcells in tile coordinates ------------------------
					const x0 = Math.floor(lon2tile(lonMin + dx * j, z) * tileSize) - x * tileSize;
					const y0 = Math.floor(lat2tile(latMin + dy * i, z) * tileSize) - y * tileSize;
					const x1 = Math.floor(lon2tile(lonMin + dx * (j + 1), z) * tileSize) - x * tileSize;
					const y1 = Math.floor(lat2tile(latMin + dy * (i + 1), z) * tileSize) - y * tileSize;

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
						let a: { x: number; y: number; v: number | bigint } = { x: 0, y: 0, v: 0 };
						let b: { x: number; y: number; v: number | bigint } = { x: 0, y: 0, v: 0 };

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
						pts.push([ix, iy]);
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

	return [segments, gridPoints];
}
