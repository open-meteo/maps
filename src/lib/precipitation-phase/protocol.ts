import {
	GridFactory,
	getCachedResolvedClipping,
	getColorScale,
	getProtocolInstance,
	getRanges,
	isSeamlessDomain
} from '@openmeteo/weather-map-layer';

import {
	MAPTERHORN_ATTRIBUTION,
	PHASE_INPUTS,
	PHASE_MAX_ZOOM,
	PHASE_TILE_SIZE,
	latitudeAt,
	longitudeAt,
	phaseInterpolation,
	tilePoint
} from './model';
import { phaseTileHalo } from './snow-pattern';

import type { PhasePoint, Tile } from './model';
import type { PhaseJob, PhaseMessage, PhaseResult, PhaseWeather } from './worker-types';
import type { Bounds, Domain, OmProtocolSettings } from '@openmeteo/weather-map-layer';
import type { AddProtocolAction } from 'maplibre-gl';

export const PHASE_PROTOCOL = 'precipitation-phase';
const protocolPrefix = `${PHASE_PROTOCOL}://`;
export const isPhaseUrl = (url: string) => url.startsWith(protocolPrefix);

let renderer: Worker | undefined;
let lastId = 0;
const pending = new Map<number, { finish: (result: PhaseResult) => void }>();

function render(job: PhaseJob, signal: AbortSignal): Promise<ImageBitmap | PhasePoint> {
	signal.throwIfAborted();
	if (!renderer) {
		renderer = new Worker(new URL('./phase.worker.ts', import.meta.url), { type: 'module' });
		renderer.onmessage = ({ data: result }: MessageEvent<PhaseResult>) => {
			const request = pending.get(result.id);
			if (request) request.finish(result);
			else if ('data' in result && result.data instanceof ImageBitmap) result.data.close();
		};
		renderer.onerror = (event) => {
			for (const [id, request] of pending) {
				request.finish({ id, error: event.message || 'Precipitation phase worker failed' });
			}
			renderer?.terminate();
			renderer = undefined;
		};
	}
	const worker = renderer;
	const id = ++lastId;
	return new Promise((resolve, reject) => {
		const abort = () => {
			worker.postMessage({ cancel: id } satisfies PhaseMessage);
			finish({ id, error: 'Cancelled' });
		};
		const finish = (result: PhaseResult) => {
			pending.delete(id);
			signal.removeEventListener('abort', abort);
			if (signal.aborted) reject(signal.reason);
			else if ('error' in result) reject(new Error(result.error));
			else resolve(result.data);
		};
		pending.set(id, { finish });
		signal.addEventListener('abort', abort, { once: true });
		try {
			worker.postMessage({ ...job, id } satisfies PhaseMessage);
		} catch (error) {
			finish({ id, error: String(error) });
		}
	});
}

const tileBounds = ({ x, y, z }: Tile, halo: number): Bounds => [
	longitudeAt(x - halo, z),
	latitudeAt(y + 1 + halo, z),
	longitudeAt(x + 1 + halo, z),
	latitudeAt(y - halo, z)
];

const parsePhaseUrl = (url: string, settings: OmProtocolSettings) => {
	const target = new URL(url.slice(protocolPrefix.length));
	const domainId = target.pathname.split('/').at(-6);
	const domain = settings.domainOptions.find(({ value }) => value === domainId);
	if (!domain || isSeamlessDomain(domain)) throw new Error('Invalid precipitation phase domain');
	const deltaTimeHours = Number(target.searchParams.get('delta_time_hours')) || 1;
	const dark = target.searchParams.get('dark') === 'true';
	const colorBlend = target.searchParams.get('color_blend') === 'true';
	const interpolation = phaseInterpolation(target.searchParams.get('interpolation'));
	const fill = target.searchParams.get('phase_fill') !== 'false';
	const contours = target.searchParams.get('contours') === 'true';
	const tile = target.searchParams.get('tile')?.split('/').map(Number);
	const path = target.origin + target.pathname;
	return { domain, deltaTimeHours, path, tile, dark, colorBlend, interpolation, fill, contours };
};

export const weatherRanges = (
	grid: Domain['grid'],
	bounds: Bounds,
	interpolation: PhaseJob['interpolation']
) => {
	const cubic = interpolation === 'cubic' || interpolation === 'monotone';
	if (grid.type === 'gaussian') {
		// Reduced Gaussian grids are stored by latitude row. Cubic sampling
		// needs the row on either side of the two used by linear sampling.
		const row = cubic ? 180 / (2 * grid.gaussianGridLatitudeLines + 0.5) : 0;
		return getRanges(grid, [bounds[0], bounds[1] - row, bounds[2], bounds[3] + row]);
	}
	const ranges = getRanges(grid, bounds);
	const limits = [grid.ny, grid.nx];
	const padding = cubic ? 1 : 0;
	// A point exactly on a regular-grid node still needs the following
	// neighbor: linear sampling reads it even when its weight is zero.
	const regularPoint =
		grid.type === 'regular' && bounds[0] === bounds[2] && bounds[1] === bounds[3];
	const endPadding = regularPoint ? padding + 1 : padding;
	return ranges.map(({ start, end }, axis) => ({
		start: Math.max(0, start - padding),
		end: Math.min(limits[axis], end + endPadding)
	}));
};

// Keep completed weather slices for the most recently rendered tiles and
// cursor lookups. The OM reader handles sharing in-flight byte-range reads.
const weatherSlices = new Map<string, PhaseWeather>();
const loadWeather = async (
	domain: Domain,
	path: string,
	deltaTimeHours: number,
	bounds: Bounds,
	settings: OmProtocolSettings,
	signal: AbortSignal,
	includeHeight: boolean,
	interpolation: PhaseJob['interpolation']
): Promise<PhaseWeather> => {
	const extent = GridFactory.create(domain.grid).getBounds();
	const [west, south, east, north] = bounds;
	if (west > extent[2] || south > extent[3] || east < extent[0] || north < extent[1]) {
		return { domain };
	}

	const ranges = weatherRanges(domain.grid, bounds, interpolation);
	if (ranges.some(({ start, end }) => end <= start)) return { domain };
	const cacheKey = JSON.stringify([path, deltaTimeHours, ranges]);
	const cached = weatherSlices.get(cacheKey);
	if (cached?.rates && (!includeHeight || cached.heights)) {
		weatherSlices.delete(cacheKey);
		weatherSlices.set(cacheKey, cached);
		return cached;
	}
	const reader = getProtocolInstance(settings).omFileReader;

	const read = async (variable: (typeof PHASE_INPUTS)[number]) => {
		try {
			const data = await reader.readVariable(path, variable, ranges, signal, { deltaTimeHours });
			return data.values;
		} catch (error) {
			if (error instanceof Error && error.message === `Variable: ${variable} not found`) {
				return undefined;
			}
			throw error;
		}
	};
	// Point lookups show snowfall height independently of precipitation.
	// Raster tiles can skip it when their precipitation field is dry.
	const ratesPromise = cached?.rates ?? read(PHASE_INPUTS[0]);
	const heightsPromise = cached?.heights ?? (includeHeight ? read(PHASE_INPUTS[1]) : undefined);
	const [rates, loadedHeights] = await Promise.all([ratesPromise, heightsPromise]);
	const wet = rates?.some((value) => value > 0);
	const heights =
		includeHeight || !wet ? loadedHeights : (loadedHeights ?? (await read(PHASE_INPUTS[1])));
	const weather = { domain, ranges, rates, heights };
	// A field can arrive on a later publication of an in-progress timestep.
	if (heights || (rates && !wet)) {
		weatherSlices.set(cacheKey, weather);
		if (weatherSlices.size > 8) weatherSlices.delete(weatherSlices.keys().next().value!);
	}
	return weather;
};

const renderAtTile = async (
	{
		domain,
		deltaTimeHours,
		path,
		dark,
		colorBlend,
		interpolation,
		fill,
		contours
	}: ReturnType<typeof parsePhaseUrl>,
	tile: Tile,
	settings: OmProtocolSettings,
	signal: AbortSignal,
	point?: PhaseJob['point']
) => {
	const weather = await loadWeather(
		domain,
		path,
		deltaTimeHours,
		point
			? [point.lon, point.lat, point.lon, point.lat]
			: tileBounds(tile, phaseTileHalo(tile.z, fill, contours) / PHASE_TILE_SIZE),
		settings,
		signal,
		!!point,
		interpolation
	);
	const clipping = point ? undefined : getCachedResolvedClipping(settings.clippingOptions);
	const colorScale = getColorScale('precipitation', dark, settings.colorScales);
	return render(
		{ tile, weather, clipping, point, colorScale, colorBlend, interpolation, fill, contours },
		signal
	);
};

export const precipitationPhaseProtocol =
	(getSettings: () => OmProtocolSettings): AddProtocolAction =>
	async ({ url, type }, { signal }) => {
		const settings = getSettings();
		const forecast = parsePhaseUrl(url, settings);
		const { domain, tile } = forecast;
		if (type === 'json') {
			return {
				data: {
					tilejson: '3.0.0',
					tiles: [`${url}&tile={z}/{x}/{y}`],
					bounds: GridFactory.create(domain.grid).getBounds(),
					attribution: MAPTERHORN_ATTRIBUTION,
					tileSize: PHASE_TILE_SIZE,
					maxzoom: PHASE_MAX_ZOOM
				}
			};
		}
		if (!tile || tile.length !== 3 || !tile.every(Number.isInteger)) {
			throw new Error('Missing precipitation phase tile coordinates');
		}
		const [z, x, y] = tile;
		return { data: await renderAtTile(forecast, { x, y, z }, settings, signal) };
	};

export const getPhasePoint = (
	url: string,
	lat: number,
	lon: number,
	zoom: number,
	settings: OmProtocolSettings,
	signal: AbortSignal
): Promise<PhasePoint & { intervalHours: number }> => {
	const { tile, u, v } = tilePoint(lat, lon, zoom);
	const forecast = parsePhaseUrl(url, settings);
	return renderAtTile(forecast, tile, settings, signal, {
		lat,
		lon: longitudeAt(tile.x + u, tile.z),
		u,
		v
	}).then((result) => ({ ...(result as PhasePoint), intervalHours: forecast.deltaTimeHours }));
};
