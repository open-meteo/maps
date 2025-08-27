import { type GetResourceResponse, type RequestParameters } from 'maplibre-gl';

import { setupGlobalCache, type TypedArray } from '@openmeteo/file-reader';

import {
	getBorderPoints,
	getBoundsFromGrid,
	getIndexFromLatLong,
	getBoundsFromBorderPoints,
	getIndicesFromBounds
} from '$lib/utils/math';

import { getInterpolator } from '$lib/utils/color-scales';

import { domains } from '$lib/utils/domains';
import { variables } from '$lib/utils/variables';

import { DynamicProjection, ProjectionGrid, type Projection } from '$lib/utils/projection';

import { OMapsFileReader } from './omaps-reader';

import TileWorker from './worker?worker';

import type { TileJSON, TileIndex, Domain, Variable, Bounds, Range, ColorScale } from '$lib/types';

let dark = false;
let partial = false;
let domain: Domain;
let variable: Variable;
let currentPath: string;
let mapBounds: number[];
let omapsFileReader: OMapsFileReader;
let mapBoundsIndexes: number[];
let ranges: Range[];

let projection: Projection;
let projectionGrid: ProjectionGrid;

setupGlobalCache();

export interface Data {
	values: TypedArray | undefined;
}

let data: Data;

const TILE_SIZE = Number(import.meta.env.VITE_TILE_SIZE) * 2;

export const getValueFromLatLong = (
	lat: number,
	lon: number,
	colorScale: ColorScale
): { index: number; value: number; direction?: number } => {
	if (data) {
		const values = data.values;

		let indexObject;
		if (domain.grid.projection) {
			indexObject = projectionGrid.findPointInterpolated(lat, lon);
		} else {
			indexObject = getIndexFromLatLong(lat, lon, domain, ranges);
		}

		const { index, xFraction, yFraction } = indexObject ?? {
			index: NaN,
			xFraction: 0,
			yFraction: 0
		};

		if (values && index) {
			const interpolator = getInterpolator(colorScale);
			//const px = interpolateLinear(data, index, xFraction, yFraction);
			const px = interpolator(values as Float32Array, domain.grid.nx, index, xFraction, yFraction);

			return { index: index, value: px };
		} else {
			return { index: NaN, value: NaN };
		}
	} else {
		return { index: NaN, value: NaN };
	}
};

const getTile = async ({ z, x, y }: TileIndex, omUrl: string): Promise<ImageBitmap> => {
	const key = `${omUrl}/${TILE_SIZE}/${z}/${x}/${y}`;

	const worker = new TileWorker();

	worker.postMessage({
		type: 'GT',
		x,
		y,
		z,
		key,
		data,
		domain,
		variable,
		ranges,
		dark: dark,
		mapBounds: mapBounds
	});
	const tilePromise = new Promise<ImageBitmap>((resolve) => {
		worker.onmessage = async (message) => {
			if (message.data.type == 'RT' && key == message.data.key) {
				resolve(message.data.tile);
			}
		};
	});

	return tilePromise;
};

const renderTile = async (url: string) => {
	// Read URL parameters
	const re = new RegExp(/om:\/\/(.+)\/(\d+)\/(\d+)\/(\d+)/);
	const result = url.match(re);
	if (!result) {
		throw new Error(`Invalid OM protocol URL '${url}'`);
	}
	const urlParts = result[1].split('#');
	const omUrl = urlParts[0];

	const z = parseInt(result[2]);
	const x = parseInt(result[3]);
	const y = parseInt(result[4]);

	// Read OM data
	const tile = await getTile({ z, x, y }, omUrl);

	return tile;
};

const getTilejson = async (fullUrl: string): Promise<TileJSON> => {
	let bounds: Bounds;
	if (domain.grid.projection) {
		const projectionName = domain.grid.projection.name;
		projection = new DynamicProjection(projectionName, domain.grid.projection) as Projection;
		projectionGrid = new ProjectionGrid(projection, domain.grid);

		const borderPoints = getBorderPoints(projectionGrid);
		bounds = getBoundsFromBorderPoints(borderPoints, projection);
	} else {
		bounds = getBoundsFromGrid(
			domain.grid.lonMin,
			domain.grid.latMin,
			domain.grid.dx,
			domain.grid.dy,
			domain.grid.nx,
			domain.grid.ny
		);
	}

	return {
		tilejson: '2.2.0',
		tiles: [fullUrl + '/{z}/{x}/{y}'],
		attribution: '<a href="https://open-meteo.com">Open-Meteo</a>',
		minzoom: 1,
		maxzoom: 15,
		bounds: bounds
	};
};

const initOMFile = async (url: string): Promise<void> => {
	const [omUrl, omParams] = url.replace('om://', '').split('?');

	const urlParams = new URLSearchParams(omParams);
	dark = urlParams.get('dark') === 'true';
	partial = urlParams.get('partial') === 'true';
	domain = domains.find((dm) => dm.value === omUrl.split('/')[4]) ?? domains[0];
	variable = variables.find((v) => urlParams.get('variable') === v.value) ?? variables[0];
	mapBounds = urlParams
		.get('bounds')
		?.split(',')
		.map((b: string): number => Number(b)) as number[];

	mapBoundsIndexes = getIndicesFromBounds(
		mapBounds[0],
		mapBounds[1],
		mapBounds[2],
		mapBounds[3],
		domain
	);

	if (partial) {
		ranges = [
			{ start: mapBoundsIndexes[1], end: mapBoundsIndexes[3] },
			{ start: mapBoundsIndexes[0], end: mapBoundsIndexes[2] }
		];
	} else {
		ranges = [
			{ start: 0, end: domain.grid.ny },
			{ start: 0, end: domain.grid.nx }
		];
	}

	if (!omapsFileReader) {
		omapsFileReader = new OMapsFileReader(domain, partial);
	}

	if (omUrl !== currentPath) {
		currentPath = omUrl;
		omapsFileReader.setReaderData(domain, partial);
		await omapsFileReader.init(omUrl);
		data = await omapsFileReader.readVariable(variable, ranges);
	} else {
		omapsFileReader.setReaderData(domain, partial);
		data = await omapsFileReader.readVariable(variable, ranges);
	}
};

export const omProtocol = async (
	params: RequestParameters
): Promise<GetResourceResponse<TileJSON | ImageBitmap>> => {
	if (params.type == 'json') {
		// Parse OMfile here to intermediately save data
		await initOMFile(params.url);
		return {
			data: await getTilejson(params.url)
		};
	} else if (params.type == 'image') {
		return {
			data: await renderTile(params.url)
		};
	} else {
		throw new Error(`Unsupported request type '${params.type}'`);
	}
};
