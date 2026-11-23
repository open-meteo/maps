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
	const contours = target.searchParams.get('contours') !== 'false';
	const tile = target.searchParams.get('tile')?.split('/').map(Number);
	const path = target.origin + target.pathname;
	return { domain, deltaTimeHours, path, tile, dark, colorBlend, interpolation, fill, contours };
};

// Keep completed weather slices for the most recently rendered tiles and
// cursor lookups. The OM reader handles sharing in-flight byte-range reads.
const weatherSlices = new Map<string, PhaseWeather>();
const loadWeather = async (
	domain: Domain,
	path: string,
	deltaTimeHours: number,
	tile: Tile,
	settings: OmProtocolSettings,
	signal: AbortSignal,
	includeHeight: boolean,
	halo: number,
	interpolation: PhaseJob['interpolation']
): Promise<PhaseWeather> => {
	const bounds = tileBounds(tile, halo);
	const extent = GridFactory.create(domain.grid).getBounds();
	const [west, south, east, north] = bounds;
	if (west > extent[2] || south > extent[3] || east < extent[0] || north < extent[1]) {
		return { domain };
	}

	let ranges = getRanges(domain.grid, bounds);
	if (ranges.some(({ start, end }) => end <= start)) return { domain };
	// A cubic stencil needs the neighboring grid cells on both sides of the
	// tile window, including when a tile edge falls exactly on a grid point.
	if (
		(interpolation === 'cubic' || interpolation === 'monotone') &&
		domain.grid.type !== 'gaussian'
	) {
		const limits = [domain.grid.ny, domain.grid.nx];
		ranges = ranges.map(({ start, end }, axis) => ({
			start: Math.max(0, start - 1),
			end: Math.min(limits[axis], end + 1)
		}));
	}
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
		tile,
		settings,
		signal,
		!!point,
		point ? 0 : phaseTileHalo(tile.z, fill, contours) / PHASE_TILE_SIZE,
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
