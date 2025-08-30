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

	getNextUrls(omUrl: string) {
		const re = new RegExp(/([0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}00)/);
		const matches = omUrl.match(re);
		let nextUrl, prevUrl;
		if (matches) {
			const date = new Date('20' + matches[0].substring(0, matches[0].length - 2) + ':00Z');

			date.setUTCHours(date.getUTCHours() - 1);
			prevUrl = omUrl.replace(
				re,
				`${String(date.getUTCFullYear()).substring(2, 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}00`
			);

			date.setUTCHours(date.getUTCHours() + 2);
			nextUrl = omUrl.replace(
				re,
				`${String(date.getUTCFullYear()).substring(2, 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}00`
			);
		}
		return [prevUrl, nextUrl];
	}

	async prefetch(omUrl: string, variable: Variable) {
		const nextOmUrls = this.getNextUrls(omUrl);
		if (nextOmUrls) {
			// previous timestep
			const s3_backend_prev = new OmHttpBackend({
				url: nextOmUrls[0],
				eTagValidation: false
			});
			try {
				this.reader = await s3_backend_prev.asCachedReader();
				const variableReader = await this.reader.getChildByName(variable.value);
				variableReader.read(OmDataType.FloatArray, this.ranges);
			} catch {}
			// next timestep
			const s3_backend_next = new OmHttpBackend({
				url: nextOmUrls[1],
				eTagValidation: false
			});
			try {
				this.reader = await s3_backend_next.asCachedReader();
				const variableReader = await this.reader.getChildByName(variable.value);
				variableReader.read(OmDataType.FloatArray, this.ranges);
			} catch {}
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
