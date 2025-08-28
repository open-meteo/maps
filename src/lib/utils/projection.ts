import { degreesToRadians, radiansToDegrees } from './math';
import type { Domain } from '$lib/types';
import type { Range } from '$lib/types';

export interface Projection {
	forward(latitude: number, longitude: number): [x: number, y: number];
	reverse(x: number, y: number): [latitude: number, longitude: number];
}

export class RotatedLatLonProjection implements Projection {
	θ: number;
	ϕ: number;
	constructor(projectionData: Domain['grid']['projection']) {
		if (projectionData) {
			const rotation = projectionData.rotation;
			this.θ = degreesToRadians(90 + rotation[0]);
			this.ϕ = degreesToRadians(rotation[1]);
		} else {
			this.θ = 0;
			this.ϕ = 0;
		}
	}

	forward(latitude: number, longitude: number): [x: number, y: number] {
		const lon = degreesToRadians(longitude);
		const lat = degreesToRadians(latitude);

		const x = Math.cos(lon) * Math.cos(lat);
		const y = Math.sin(lon) * Math.cos(lat);
		const z = Math.sin(lat);

		const x2 =
			Math.cos(this.θ) * Math.cos(this.ϕ) * x +
			Math.cos(this.θ) * Math.sin(this.ϕ) * y +
			Math.sin(this.θ) * z;
		const y2 = -Math.sin(this.ϕ) * x + Math.cos(this.ϕ) * y;
		const z2 =
			-Math.sin(this.θ) * Math.cos(this.ϕ) * x -
			Math.sin(this.θ) * Math.sin(this.ϕ) * y +
			Math.cos(this.θ) * z;

		return [-1 * radiansToDegrees(Math.atan2(y2, x2)), -1 * radiansToDegrees(Math.asin(z2))];
	}

	reverse(x: number, y: number): [latitude: number, longitude: number] {
		const lon = degreesToRadians(x);
		const lat = degreesToRadians(y);

		// quick solution without conversion in cartesian space
		const lat2 =
			-1 *
			Math.asin(
				Math.cos(this.θ) * Math.sin(lat) - Math.cos(lon) * Math.sin(this.θ) * Math.cos(lat)
			);
		const lon2 =
			-1 *
			(Math.atan2(
				Math.sin(lon),
				Math.tan(lat) * Math.sin(this.θ) + Math.cos(lon) * Math.cos(this.θ)
			) -
				this.ϕ);
		return [radiansToDegrees(lat2), ((radiansToDegrees(lon2) + 180) % 360) - 180];
	}
}

export class LambertConformalConicProjection implements Projection {
	ρ0;
	F;
	n;
	λ0;

	R = 6370.997; // Radius of the Earth
	constructor(projectionData: Domain['grid']['projection']) {
		if (projectionData) {
			const λ0_dec = projectionData.λ0;
			const ϕ0_dec = projectionData.ϕ0;
			const ϕ1_dec = projectionData.ϕ1;
			const ϕ2_dec = projectionData.ϕ2;
			const radius = projectionData.radius;
			this.λ0 = degreesToRadians(((λ0_dec + 180) % 360) - 180);
			const ϕ0 = degreesToRadians(ϕ0_dec);
			const ϕ1 = degreesToRadians(ϕ1_dec);
			const ϕ2 = degreesToRadians(ϕ2_dec);

			if (ϕ1 == ϕ2) {
				this.n = Math.sin(ϕ1);
			} else {
				this.n =
					Math.log(Math.cos(ϕ1) / Math.cos(ϕ2)) /
					Math.log(Math.tan(Math.PI / 4 + ϕ2 / 2) / Math.tan(Math.PI / 4 + ϕ1 / 2));
			}
			this.F = (Math.cos(ϕ1) * Math.pow(Math.tan(Math.PI / 4 + ϕ1 / 2), this.n)) / this.n;
			this.ρ0 = this.F / Math.pow(Math.tan(Math.PI / 4 + ϕ0 / 2), this.n);

			if (radius) {
				this.R = radius;
			}
		}
	}

	forward(latitude: number, longitude: number): [x: number, y: number] {
		const ϕ = degreesToRadians(latitude);
		const λ = degreesToRadians(longitude);
		// If (λ - λ0) exceeds the range:±: 180°, 360° should be added or subtracted.
		const θ = this.n * (λ - this.λ0);

		const p = this.F / Math.pow(Math.tan(Math.PI / 4 + ϕ / 2), this.n);
		const x = this.R * p * Math.sin(θ);
		const y = this.R * (this.ρ0 - p * Math.cos(θ));
		return [x, y];
	}

	reverse(x: number, y: number): [latitude: number, longitude: number] {
		const x_scaled = x / this.R;
		const y_scaled = y / this.R;

		const θ =
			this.n >= 0
				? Math.atan2(x_scaled, this.ρ0 - y_scaled)
				: Math.atan2(-1 * x_scaled, y_scaled - this.ρ0);
		const ρ =
			(this.n > 0 ? 1 : -1) * Math.sqrt(Math.pow(x_scaled, 2) + Math.pow(this.ρ0 - y_scaled, 2));

		const ϕ_rad = 2 * Math.atan(Math.pow(this.F / ρ, 1 / this.n)) - Math.PI / 2;
		const λ_rad = this.λ0 + θ / this.n;

		const ϕ = radiansToDegrees(ϕ_rad);
		const λ = radiansToDegrees(λ_rad);

		return [ϕ, λ > 180 ? λ - 360 : λ];
	}
}

export class LambertAzimuthalEqualAreaProjection implements Projection {
	λ0;
	ϕ1;
	R = 6371229; // Radius of the Earth
	constructor(projectionData: Domain['grid']['projection']) {
		if (projectionData) {
			const λ0_dec = projectionData.λ0;
			const ϕ1_dec = projectionData.ϕ1;
			const radius = projectionData.radius;
			this.λ0 = degreesToRadians(λ0_dec);
			this.ϕ1 = degreesToRadians(ϕ1_dec);
			if (radius) {
				this.R = radius;
			}
		} else {
			this.λ0 = 0;
			this.ϕ1 = 0;
		}
	}

	forward(latitude: number, longitude: number): [x: number, y: number] {
		const λ = degreesToRadians(longitude);
		const ϕ = degreesToRadians(latitude);

		const k = Math.sqrt(
			2 /
				(1 +
					Math.sin(this.ϕ1) * Math.sin(ϕ) +
					Math.cos(this.ϕ1) * Math.cos(ϕ) * Math.cos(λ - this.λ0))
		);

		const x = this.R * k * Math.cos(ϕ) * Math.sin(λ - this.λ0);
		const y =
			this.R *
			k *
			(Math.cos(this.ϕ1) * Math.sin(ϕ) - Math.sin(this.ϕ1) * Math.cos(ϕ) * Math.cos(λ - this.λ0));

		return [x, y];
	}

	reverse(x: number, y: number): [latitude: number, longitude: number] {
		x = x / this.R;
		y = y / this.R;
		const ρ = Math.sqrt(x * x + y * y);
		const c = 2 * Math.asin(0.5 * ρ);
		let ϕ = Math.asin(Math.cos(c) * Math.sin(this.ϕ1) + (y * Math.sin(c) * Math.cos(this.ϕ1)) / ρ);
		let λ =
			this.λ0 +
			Math.atan(
				(x * Math.sin(c)) /
					(ρ * Math.cos(this.ϕ1) * Math.cos(c) - y * Math.sin(this.ϕ1) * Math.sin(c))
			);

		ϕ = radiansToDegrees(ϕ);
		λ = radiansToDegrees(λ);

		return [ϕ, λ];
	}
}

export class StereograpicProjection implements Projection {
	λ0: number; // Central longitude
	sinϕ1: number; // Sinus of central latitude
	cosϕ1: number; // Cosine of central latitude
	R = 6371229; // Radius of Earth
	constructor(projectionData: Domain['grid']['projection']) {
		if (projectionData) {
			this.λ0 = degreesToRadians(projectionData.longitude as number);
			this.sinϕ1 = Math.sin(degreesToRadians(projectionData.latitude as number));
			this.cosϕ1 = Math.cos(degreesToRadians(projectionData.latitude as number));
			if (projectionData.radius) {
				this.R = projectionData.radius;
			}
		} else {
			this.λ0 = 0;
			this.sinϕ1 = 0;
			this.cosϕ1 = 0;
		}
	}

	forward(latitude: number, longitude: number): [x: number, y: number] {
		let ϕ = degreesToRadians(latitude);
		let λ = degreesToRadians(longitude);
		let k =
			(2 * this.R) /
			(1 + this.sinϕ1 * Math.sin(ϕ) + this.cosϕ1 * Math.cos(ϕ) * Math.cos(λ - this.λ0));
		let x = k * Math.cos(ϕ) * Math.sin(λ - this.λ0);
		let y = k * (this.cosϕ1 * Math.sin(ϕ) - this.sinϕ1 * Math.cos(ϕ) * Math.cos(λ - this.λ0));
		return [x, y];
	}

	reverse(x: number, y: number): [latitude: number, longitude: number] {
		let p = Math.sqrt(x * x + y * y);
		let c = 2 * Math.atan2(p, 2 * this.R);
		let ϕ = Math.asin(Math.cos(c) * this.sinϕ1 + (y * Math.sin(c) * this.cosϕ1) / p);
		let λ =
			this.λ0 +
			Math.atan2(x * Math.sin(c), p * this.cosϕ1 * Math.cos(c) - y * this.sinϕ1 * Math.sin(c));
		return [radiansToDegrees(ϕ), radiansToDegrees(λ)];
	}
}

const projections = {
	StereograpicProjection,
	RotatedLatLonProjection,
	LambertConformalConicProjection,
	LambertAzimuthalEqualAreaProjection
};

export class DynamicProjection {
	constructor(projName: string, opts: Domain['grid']['projection']) {
		return new projections[projName](opts);
	}
}

export class ProjectionGrid {
	projection;
	nx;
	ny;
	origin;
	dx; //meters
	dy; //meters
	range;

	constructor(
		projection: Projection,
		grid: Domain['grid'],
		ranges: Range[] = [
			{ start: 0, end: grid.ny },
			{ start: 0, end: grid.nx }
		]
	) {
		this.ranges = ranges;
		this.projection = projection;

		const latitude = grid.projection?.latitude ?? grid.latMin;
		const longitude = grid.projection?.longitude ?? grid.lonMin;
		const projectOrigin = grid.projection?.projectOrigin ?? true;

		this.nx = grid.nx;
		this.ny = grid.ny;
		if (latitude && Array === latitude.constructor) {
			const sw = projection.forward(latitude[0], longitude[0]);
			const ne = projection.forward(latitude[1], longitude[1]);
			this.origin = sw;
			this.dx = (ne[0] - sw[0]) / (this.nx - 1);
			this.dy = (ne[1] - sw[1]) / (this.ny - 1);
		} else if (projectOrigin) {
			this.dx = grid.dx;
			this.dy = grid.dy;
			this.origin = this.projection.forward(latitude as number, longitude as number);
		} else {
			this.dx = grid.dx;
			this.dy = grid.dy;
			this.origin = [latitude as number, longitude as number];
		}
	}

	findPointInterpolated(lat: number, lon: number) {
		const [xpos, ypos] = this.projection.forward(lat, lon);

		const x = (xpos - this.origin[0]) / this.dx;
		const y = (ypos - this.origin[1]) / this.dy;

		const xFraction = x - Math.floor(x);
		const yFraction = y - Math.floor(y);

		if (y < 0 || x < 0 || y >= this.ny || x >= this.nx) {
			return { index: NaN, xFraction: 0, yFraction: 0 };
		}
		const index = Math.floor(y) * this.nx + Math.floor(x);
		return { index: index, xFraction, yFraction };
	}

	findPointInterpolated2D(lat: number, lon: number) {
		const [xpos, ypos] = this.projection.forward(lat, lon);

		const x = Math.max(
			Math.min((xpos - this.origin[0]) / this.dx, this.ranges[1]['end'] - this.ranges[1]['start']),
			0
		);
		const y = Math.max(
			Math.min((ypos - this.origin[1]) / this.dy, this.ranges[0]['end'] - this.ranges[0]['start']),
			0
		);

		return [x, y];
	}
}
