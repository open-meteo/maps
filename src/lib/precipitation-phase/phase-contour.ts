// Keep enough neighboring samples for both the line and its stroke at a tile edge.
export const PHASE_CONTOUR_HALO = 2;
export const PHASE_CONTOUR_COLOR = '#c6f7ff';
export const PHASE_CONTOUR_HALO_COLOR = '#183650';

/** Trace the zero crossing in a padded grid, in output-pixel coordinates. */
export const tracePhaseBoundary = (
	differences: Float32Array,
	size: number,
	path: Pick<Path2D, 'moveTo' | 'lineTo'>,
	halo = PHASE_CONTOUR_HALO
) => {
	const stride = size + 2 * halo;
	const connection = [
		[],
		[0, 3],
		[0, 1],
		[1, 3],
		[1, 2],
		[],
		[0, 2],
		[2, 3],
		[2, 3],
		[0, 2],
		[],
		[1, 2],
		[1, 3],
		[0, 1],
		[0, 3],
		[]
	];

	for (let row = 0; row < stride - 1; row++) {
		for (let col = 0; col < stride - 1; col++) {
			const index = row * stride + col;
			const topLeft = differences[index];
			const topRight = differences[index + 1];
			const bottomRight = differences[index + stride + 1];
			const bottomLeft = differences[index + stride];
			if (
				!Number.isFinite(topLeft) ||
				!Number.isFinite(topRight) ||
				!Number.isFinite(bottomRight) ||
				!Number.isFinite(bottomLeft)
			)
				continue;

			const mask =
				Number(topLeft >= 0) |
				(Number(topRight >= 0) << 1) |
				(Number(bottomRight >= 0) << 2) |
				(Number(bottomLeft >= 0) << 3);
			if (mask === 0 || mask === 15) continue;

			const x = col - halo + 0.5;
			const y = row - halo + 0.5;
			const point = (edge: number): [number, number] => {
				switch (edge) {
					case 0:
						return [x + topLeft / (topLeft - topRight), y];
					case 1:
						return [x + 1, y + topRight / (topRight - bottomRight)];
					case 2:
						return [x + bottomLeft / (bottomLeft - bottomRight), y + 1];
					default:
						return [x, y + topLeft / (topLeft - bottomLeft)];
				}
			};
			const segment = (start: number, end: number) => {
				path.moveTo(...point(start));
				path.lineTo(...point(end));
			};

			if (mask === 5 || mask === 10) {
				// In a saddle cell, connect the corners that share the center's phase.
				if (topLeft >= 0 === topLeft + topRight + bottomRight + bottomLeft >= 0) {
					segment(0, 1);
					segment(2, 3);
				} else {
					segment(0, 3);
					segment(1, 2);
				}
			} else {
				const [start, end] = connection[mask];
				segment(start, end);
			}
		}
	}
};
