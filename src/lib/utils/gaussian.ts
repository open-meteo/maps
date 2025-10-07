/**
 * Implementation of a Gaussian grid projection for mapping, specifically the O1280 version used by ECMWF IFS
 */
export class GaussianGrid {
	private readonly latitudeLines: number = 1280;

	constructor() {
		// O1280 configuration is hardcoded since that's all we need
	}

	/**
	 * Number of points in the grid
	 */
	private get count(): number {
		return 4 * this.latitudeLines * (this.latitudeLines + 9); // 6599680
	}

	/**
	 * Get the number of points in a specific latitude line
	 * @param y - The latitude line index
	 */
	nxOf(y: number): number {
		return y < this.latitudeLines ? 20 + y * 4 : (2 * this.latitudeLines - y - 1) * 4 + 20;
	}

	private integral(y: number): number {
		return y < this.latitudeLines
			? 2 * y * y + 18 * y
			: this.count -
					(2 * (2 * this.latitudeLines - y) * (2 * this.latitudeLines - y) +
						18 * (2 * this.latitudeLines - y));
	}

	/**
	 * Get the latitude and longitude coordinates for a grid point
	 */
	getCoordinates(gridpoint: number): { latitude: number; longitude: number } {
		const { y: y, x: x, nx: nx } = this.getPos(gridpoint);

		const dx = 360 / nx;
		const dy = 180 / (2 * this.latitudeLines + 0.5);

		const lon = x * dx;
		const adjustedLon = lon >= 180 ? lon - 360 : lon;

		return {
			latitude: (this.latitudeLines - y - 1) * dy + dy / 2,
			longitude: adjustedLon
		};
	}

	/**
	 * Find the grid point index for given latitude and longitude
	 */
	findPoint(lat: number, lon: number): number {
		const dy = 180 / (2 * this.latitudeLines + 0.5);
		const y =
			(Math.round(this.latitudeLines - 1 - (lat - dy / 2) / dy) + 2 * this.latitudeLines) %
			(2 * this.latitudeLines);

		const nx = this.nxOf(y);
		const dx = 360 / nx;

		const x = (Math.round(lon / dx) + nx) % nx;
		return this.integral(y) + x;
	}

	getPos(gridpoint: number): { y: number; x: number; nx: number } {
		const y =
			gridpoint < this.count / 2
				? Math.floor((Math.sqrt(2 * gridpoint + 81) - 9) / 2)
				: 2 * this.latitudeLines -
					1 -
					Math.floor((Math.sqrt(2 * (this.count - gridpoint - 1) + 81) - 9) / 2);

		const integral = this.integral(y);
		const x = gridpoint - integral;
		const nx = this.nxOf(y);

		return { y, x, nx };
	}

	/**
	 * Remap Gaussian grid data to a regular lat-lon grid
	 * @param values - Original Gaussian grid data
	 * @param targetWidth - Target grid width
	 * @param targetHeight - Target grid height
	 * @param bounds - Optional bounds for the output grid
	 * @param latitudeIncreasing - If true, latitude increases with row index (south to north),
	 *                           if false (default), latitude decreases with row index (north to south)
	 * @returns Remapped data in regular grid format
	 */
	remapToRegularGrid(
		values: number[],
		targetWidth: number,
		targetHeight: number,
		bounds = { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 }
	): number[] {
		console.time('Remapping Gaussian grid');

		// Create a result array for the regular grid
		const result = new Array(targetWidth * targetHeight).fill(NaN);

		// Calculate lat/lon spans
		const latSpan = bounds.maxLat - bounds.minLat;
		const lonSpan = bounds.maxLon - bounds.minLon;

		// For each point in the regular grid
		for (let y = 0; y < targetHeight; y++) {
			// Calculate latitude for this row based on direction preference
			const lat = bounds.minLat + (y / targetHeight) * latSpan;

			for (let x = 0; x < targetWidth; x++) {
				// Calculate longitude for this column
				const lon = (x / targetWidth) * lonSpan + bounds.minLon;

				// Find the nearest Gaussian grid point
				const gridpoint = this.findPoint(lat, lon);

				// Copy the data value if it's valid
				if (gridpoint >= 0 && gridpoint < values.length) {
					result[y * targetWidth + x] = values[gridpoint];
				}
			}
		}

		console.timeEnd('Remapping Gaussian grid');
		return result;
	}
}
