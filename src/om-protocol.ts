import { browser } from '$app/environment';

import { type GetResourceResponse, type RequestParameters } from 'maplibre-gl';

import { setupGlobalCache, type TypedArray } from '@openmeteo/file-reader';

import {
	getBorderPoints,
	getBoundsFromGrid,
	getIndexFromLatLong,
	getBoundsFromBorderPoints,
	getIndicesFromBounds
} from '$lib/utils/math';

import { colorScales as defaultColorScales, getInterpolator } from '$lib/utils/color-scales';

import { domainOptions } from '$lib/utils/domains';
import { variableOptions } from '$lib/utils/variables';

import { DynamicProjection, ProjectionGrid, type Projection } from '$lib/utils/projections';

import { OMapsFileReader } from './omaps-reader';

import TileWorker from './worker?worker';

import arrowPixelsSource from '$lib/utils/arrow';

import type {
	Bounds,
	Domain,
	Variable,
	TileJSON,
	TileIndex,
	ColorScale,
	DimensionRange
} from '$lib/types';

let dark = false;
let partial = false;
let domain: Domain;
let variable: Variable;
let mapBounds: number[];
let omapsFileReader: OMapsFileReader;
let mapBoundsIndexes: number[];
let ranges: DimensionRange[];

let projection: Projection;
let projectionGrid: ProjectionGrid;

setupGlobalCache();

const arrowPixelData: Record<string, ImageDataArray> = {};
const initPixelData = async () => {
	const loadIcon = async (key: string, iconUrl: string) => {
		const svgText = await fetch(iconUrl).then((r) => r.text());
		const canvas = new OffscreenCanvas(32, 32);

		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => {
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					reject(new Error('Failed to get 2D context'));
					return;
				}
				ctx.drawImage(img, 0, 0, 32, 32);
				arrowPixelData[key] = ctx.getImageData(0, 0, 32, 32).data;
				resolve(void 0);
			};
			img.onerror = reject;
			img.src = `data:image/svg+xml;base64,${btoa(svgText)}`;
		});
	};

	await Promise.all(Object.entries(arrowPixelsSource).map(([key, url]) => loadIcon(key, url)));
};

export interface Data {
	values: TypedArray | undefined;
	directions: TypedArray | undefined;
}

let data: Data;

const TILE_SIZE = Number(import.meta.env.VITE_TILE_SIZE) * 2;

let worker: Worker;
const pendingTiles = new Map<string, (tile: ImageBitmap) => void>();

const getWorker = () => {
	// ensure this code only runs on the client
	if (browser && !worker) {
		worker = new TileWorker();
		worker.onmessage = (message) => {
			if (message.data.type === 'RT') {
				const key = message.data.key;
				const resolve = pendingTiles.get(key);
				if (resolve) {
					resolve(message.data.tile);
					pendingTiles.delete(key);
				}
			}
		};
	}
	return worker;
};

export const getValueFromLatLong = (
	lat: number,
	lon: number,
	colorScale: ColorScale
): { index: number; value: number; direction?: number } => {
	if (data) {
		const values = data.values;

		let indexObject;
		if (domain.grid.projection) {
			indexObject = projectionGrid.findPointInterpolated(lat, lon, ranges);
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

			const px = interpolator(values as Float32Array, index, xFraction, yFraction, ranges);

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

	const tileWorker = getWorker();

	let iconList = {};
	if (variable.value.startsWith('wind') || variable.value.startsWith('wave')) {
		iconList = arrowPixelData;
	}

	tileWorker.postMessage({
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
		mapBounds: mapBounds,
		iconPixelData: iconList
	});
	return new Promise<ImageBitmap>((resolve) => {
		pendingTiles.set(key, resolve);
	});
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

const initOMFile = (url: string): Promise<void> => {
	initPixelData();

	return new Promise((resolve, reject) => {
		const [omUrl, omParams] = url.replace('om://', '').split('?');

		const urlParams = new URLSearchParams(omParams);
		dark = urlParams.get('dark') === 'true';
		partial = urlParams.get('partial') === 'true';
		domain = domainOptions.find((dm) => dm.value === omUrl.split('/')[4]) ?? domainOptions[0];
		variable =
			variableOptions.find((v) => urlParams.get('variable') === v.value) ?? variableOptions[0];
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

		omapsFileReader.setReaderData(domain, partial);
		omapsFileReader
			.init(omUrl)
			.then(() => {
				omapsFileReader.readVariable(variable, ranges).then((values) => {
					data = values;
					resolve();
					// prefetch first bytes of the previous and next timesteps to trigger CF caching
					omapsFileReader.prefetch(omUrl);
				});
			})
			.catch((e) => {
				reject(e);
			});
	});
};

export const omProtocol = async (
	params: RequestParameters,
	colorScales: ColorScales = defaultColorScales
): Promise<GetResourceResponse<TileJSON | ImageBitmap>> => {
	if (params.type == 'json') {
		try {
			await initOMFile(params.url, colorScales);
		} catch (e) {
			throw new Error(e);
		}
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
