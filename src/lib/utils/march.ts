import type { Domain } from '$lib/types';

import { lon2tile, lat2tile } from '$lib/utils/math';

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
	threshold: number
): number {
	if (v0 === v1) return (t0 + t1) * 0.5; // degenerate cell
	return t0 + ((threshold - Number(v0)) * (t1 - t0)) / (Number(v1) - Number(v0));
}

export const marchingSquares = (
	values: TypedArray,
	threshold: number,
	z: number,
	y: number,
	x: number,
	domain: Domain
): number[][] => {
	const segments = [];

	const nx = domain.grid.nx;
	const ny = domain.grid.ny;

	const dx = domain.grid.dx;
	const dy = domain.grid.dy;

	const latMin = domain.grid.latMin;
	const lonMin = domain.grid.lonMin;

	const tileSize = 4096;
	const margin = 256;
	for (let j = 0; j < ny; j++) {
		const lat = latMin + dy * j;
		const worldPy = Math.floor(lat2tile(lat, z) * tileSize);
		const py = worldPy - y * tileSize;
		if (py > -margin && py <= tileSize + margin) {
			for (let i = 0; i < nx; i++) {
				const lon = lonMin + dx * i;
				const worldPx = Math.floor(lon2tile(lon, z) * tileSize);
				const px = worldPx - x * tileSize;
				if (px > -margin && px <= tileSize + margin) {
					const index = j * nx + i;

					/* v3 ------- v2
					 * |      	  |
					 * |      	  |
					 * v0 -------- v1
					 *
					 * v0 = (i, j)
					 * v1 = (i + 1, j)
					 * v2 = (i + 1, j + 1)
					 * v3 = (i, j + 1)
					 */

					const v0 = values[index]; // (i, j)  west‑south, or bottom-left
					const v1 = values[index + 1]; // (i + 1, j)  east‑south, bottom-right
					const v2 = values[index + nx + 1]; // (i + 1, j + 1) east‑north, or top-right
					const v3 = values[index + nx]; //  (i, j + 1) west‑north, or top-left

					const edgeCode =
						(v0 > threshold ? 1 : 0) |
						(v1 > threshold ? 2 : 0) |
						(v2 > threshold ? 4 : 0) |
						(v3 > threshold ? 8 : 0);

					if (edgeCode === 0 || edgeCode === 15) continue; // no contour inside this cell

					// ----- fetch the edges that need intersections -----
					const edges = edgeTable[edgeCode];

					/* 	 ---------- x1, y1
					 * 	|      	  	|
					 * 	|      	  	|
					 * x0, y0 ----------
					 *
					 * x0 = px
					 * y0 = py
					 * x1 = ... + dx;
					 * y1 = ... + dy
					 */

					// ----- corners of 4 gridcells in tile coordinates -----
					// const x0 = px;
					// const y0 = py;
					// const x1 = Math.floor(lon2tile(lon + dx, z) * tileSize) - x * tileSize;
					// const y1 = Math.floor(lat2tile(lat + dy, z) * tileSize) - y * tileSize;

					// ----- corners of 4 gridcells in wgs84 coordinates -----
					const x0 = lon;
					const y0 = lat;
					const x1 = lon + dx;
					const y1 = lat + dy;

					const pts = [];
					for (const [ea, eb] of edges) {
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

						const ix = interpolate(a.v, b.v, a.x, b.x, threshold);
						const iy = interpolate(a.v, b.v, a.y, b.y, threshold);

						// project from wgs84 to webmercator
						const xl = Math.floor(lon2tile(ix, z) * tileSize) - x * tileSize;
						const yl = Math.floor(lat2tile(iy, z) * tileSize) - y * tileSize;
						pts.push([xl, yl]);
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
};
