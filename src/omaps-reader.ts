import { DynamicProjection, ProjectionGrid, type Projection } from '$lib/utils/projection';

import { OmDataType, OmHttpBackend } from '@openmeteo/file-reader';

import type { Domain, Range, Variable } from './lib/types';
import type { Data } from './om-protocol';

export class OMapsFileReader {
	child;
	reader;

	partial;
	ranges;

	domain;
	projection;
	projectionGrid;

	constructor(domain: Domain, partial: boolean) {
		this.setReaderData(domain, partial);
	}

	async init(omUrl: string) {
		this.dispose();
		const s3_backend = new OmHttpBackend({
			url: omUrl,
			eTagValidation: false,
			retries: 2
		});
		this.reader = await s3_backend.asCachedReader();
	}

	setReaderData(domain: Domain, partial: boolean) {
		this.partial = partial;
		this.domain = domain;
		if (domain.grid.projection) {
			const projectionName = domain.grid.projection.name;
			this.projection = new DynamicProjection(projectionName, domain.grid.projection) as Projection;
			this.projectionGrid = new ProjectionGrid(this.projection, domain.grid);
		}
	}

	setRanges(ranges: Range[] | null, dimensions: number[]) {
		if (this.partial) {
			this.ranges = ranges ?? this.ranges;
		} else {
			this.ranges = [
				{ start: 0, end: dimensions[0] },
				{ start: 0, end: dimensions[1] }
			];
		}
	}

	async readVariable(variable: Variable, ranges: Range[] | null = null): Promise<Data> {
		let values, directions;
		if (variable.value.includes('_u_component')) {
			// combine uv components, and calculate directions
			const variableReaderU = await this.reader.getChildByName(variable.value);
			const variableReaderV = await this.reader.getChildByName(
				variable.value.replace('_u_component', '_v_component')
			);
			const dimensions = variableReaderU.getDimensions();

			this.setRanges(ranges, dimensions);

			const valuesU = await variableReaderU.read(OmDataType.FloatArray, this.ranges);
			const valuesV = await variableReaderV.read(OmDataType.FloatArray, this.ranges);

			values = [];
			directions = [];
			for (const [i, uValue] of valuesU.entries()) {
				values.push(Math.sqrt(Math.pow(uValue, 2) + Math.pow(valuesV[i], 2)) * 1.94384); // convert from m/s to knots
				directions.push((Math.atan2(uValue, valuesV[i]) * (180 / Math.PI) + 360) % 360);
			}
		} else {
			const variableReader = await this.reader.getChildByName(variable.value);
			const dimensions = variableReader.getDimensions();

			this.setRanges(ranges, dimensions);

			values = await variableReader.read(OmDataType.FloatArray, this.ranges);
		}

		if (variable.value.includes('_speed_')) {
			// also get the direction for speed values
			const variableReader = await this.reader.getChildByName(
				variable.value.replace('_speed_', '_direction_')
			);

			directions = await variableReader.read(OmDataType.FloatArray, this.ranges);
		}
		if (variable.value === 'wave_height') {
			// also get the direction for speed values
			const variableReader = await this.reader.getChildByName(
				variable.value.replace('wave_height', 'wave_direction')
			);

			directions = await variableReader.read(OmDataType.FloatArray, this.ranges);
		}

		return {
			values: values,
			directions: directions
		};
	}

	dispose() {
		if (this.child) {
			this.child.dispose();
		}
		if (this.reader) {
			this.reader.dispose();
		}

		delete this.child;
		delete this.reader;
	}
}
