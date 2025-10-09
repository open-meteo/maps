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
}

export class GaussianGridToRegularGrid {
	private gaussianGrid: GaussianGrid;
	private lookupTable: Int32Array;
	private readonly targetWidth: number;
	private readonly targetHeight: number;

	/**
	 * Create a new remapper for a specific target grid size
	 * @param targetWidth - Width of the target regular grid
	 * @param targetHeight - Height of the target regular grid
	 * @param bounds - Lat/lon bounds for the target grid
	 */
	constructor(
		targetWidth: number,
		targetHeight: number,
		bounds = { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 }
	) {
		this.gaussianGrid = new GaussianGrid();
		this.targetWidth = targetWidth;
		this.targetHeight = targetHeight;

		// Build the lookup table during initialization
		this.lookupTable = this.buildLookupTable(bounds);
		console.log(`GaussianGridRemapper created for ${targetWidth}x${targetHeight} grid`);
	}

	/**
	 * Build a lookup table mapping each target grid cell to its corresponding Gaussian grid point
	 * @private
	 */
	private buildLookupTable(bounds: {
		minLat: number;
		maxLat: number;
		minLon: number;
		maxLon: number;
	}): Int32Array {
		console.time('Building Gaussian grid lookup table');

		const lookup = new Int32Array(this.targetWidth * this.targetHeight);
		const latSpan = bounds.maxLat - bounds.minLat;
		const lonSpan = bounds.maxLon - bounds.minLon;

		// For each point in the target regular grid
		for (let y = 0; y < this.targetHeight; y++) {
			const lat = bounds.minLat + (y / this.targetHeight) * latSpan;

			for (let x = 0; x < this.targetWidth; x++) {
				const lon = (x / this.targetWidth) * lonSpan + bounds.minLon;

				const gridpoint = this.gaussianGrid.findPoint(lat, lon);
				lookup[y * this.targetWidth + x] = gridpoint;
			}
		}

		console.timeEnd('Building Gaussian grid lookup table');
		return lookup;
	}

	/**
	 * Remap Gaussian grid data to the target regular grid using pre-computed lookup table
	 */
	remapData(values: Float32Array): Float32Array {
		console.time('Remapping Gaussian grid with lookup table');

		const result = new Float32Array(this.targetWidth * this.targetHeight);

		for (let i = 0; i < this.lookupTable.length; i++) {
			const gaussianIndex = this.lookupTable[i];
			result[i] = values[gaussianIndex];
		}

		console.timeEnd('Remapping Gaussian grid with lookup table');
		return result;
	}
}
