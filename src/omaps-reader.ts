import { OmDataType, OmHttpBackend } from '@openmeteo/file-reader';

import { DynamicProjection, ProjectionGrid, type Projection } from '$lib/utils/projection';

import { pad } from '$lib/utils/pad';

import type { Domain, Range, Variable } from '$lib/types';

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
			eTagValidation: false
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
	async readVariable(variable: Variable, ranges: Range[] | null = null): Promise<Data> {
		const variableReader = await this.reader.getChildByName(variable.value);
		const dimensions = variableReader.getDimensions();
		if (this.partial) {
			this.ranges = ranges ?? this.ranges;
		} else {
			this.ranges = [
				{ start: 0, end: dimensions[0] },
				{ start: 0, end: dimensions[1] }
			];
		}
		return {
			values: await variableReader.read(OmDataType.FloatArray, this.ranges)
		};
	}

	getNextUrl(omUrl: string) {
		const re = new RegExp(/(T(.*)00)/);
		const matches = omUrl.match(re);
		let currentTime, nextTime, nextUrl;
		if (matches) {
			currentTime = matches[2];
			nextTime = pad(Number(currentTime) + 1);
			if (nextTime === '24') {
				nextTime = '00';
			}
			nextUrl = omUrl.replace(`T${currentTime}00`, `T${nextTime}00`);
		}
		return nextUrl;
	}

	async prefetch(omUrl: string) {
		const nextOmUrl = this.getNextUrl(omUrl);
		if (nextOmUrl) {
			const s3_backend = new OmHttpBackend({
				url: nextOmUrl,
				eTagValidation: false
			});
			this.reader = await s3_backend.asCachedReader();
		}
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
