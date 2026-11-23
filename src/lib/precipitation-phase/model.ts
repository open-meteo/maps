import type { InterpolationMethod } from '@openmeteo/weather-map-layer';

export const RAIN_SNOW = 'rain_snow';
export const RAIN_SNOW_LABEL = 'Rain & Snow';
export const PHASE_INPUTS = ['precipitation', 'snowfall_height'] as const;
const MAPTERHORN_ORIGIN = 'https://tiles.mapterhorn.com';
export const MAPTERHORN_TILEJSON = `${MAPTERHORN_ORIGIN}/tilejson.json`;
export const MAPTERHORN_ATTRIBUTION =
	"<a href='https://mapterhorn.com/attribution'>© Mapterhorn</a>";
export const PHASE_TILE_SIZE = 512;
export const PHASE_MAX_ZOOM = 18;
const DEM_MAX_ZOOM = 12;

export const phaseLabels = {
	rain: 'Rain',
	snow: 'Snow',
	transition: 'Rain/snow transition',
	unknown: 'Phase unknown'
} as const;

export type Phase = keyof typeof phaseLabels;
export type PhasePoint = { rate: number; height: number; elevation: number };
export type Tile = { x: number; y: number; z: number };

export const mapterhornTileUrl = ({ z, x, y }: Tile) => `${MAPTERHORN_ORIGIN}/${z}/${x}/${y}.webp`;

/** Reuse the DEM pyramid at high zoom while drawing small marks in the weather tiles. */
export const demTileRegion = (tile: Tile) => {
	const z = Math.min(tile.z, DEM_MAX_ZOOM);
	const scale = 2 ** (tile.z - z);
	const x = Math.floor(tile.x / scale);
	const y = Math.floor(tile.y / scale);
	return { tile: { x, y, z }, scale, offsetX: tile.x - x * scale, offsetY: tile.y - y * scale };
};

export const hasPhaseInputs = (stored: Set<string>): boolean =>
	PHASE_INPUTS.every((variable) => stored.has(variable));

/** The blend writes six-hour QPF after its first 36 forecast hours. */
export const precipitationInterval = (domain: string, leadHours: number, stepHours: number) =>
	domain === 'ncep_nbm_conus' ? (leadHours > 36 ? 6 : 1) : stepHours;

/** Terrain elevation minus forecast snowfall height, in metres. */
export const classifyPhase = (difference: number): Phase => {
	if (!Number.isFinite(difference)) return 'unknown';
	if (Math.abs(difference) <= 100) return 'transition';
	return difference > 0 ? 'snow' : 'rain';
};

export const UNKNOWN_PHASE_COLOR = [112, 116, 125] as const;

export const phaseInterpolation = (value: string | null): InterpolationMethod =>
	value === 'nearest' || value === 'cubic' || value === 'monotone' ? value : 'linear';

export const decodeTerrarium = (red: number, green: number, blue: number) =>
	red * 256 + green + blue / 256 - 32768;

export const longitudeAt = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
export const latitudeAt = (y: number, z: number) =>
	(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

export const tilePoint = (lat: number, lon: number, zoom: number) => {
	const z = Math.max(0, Math.min(PHASE_MAX_ZOOM, Math.round(zoom)));
	const n = 2 ** z;
	const x = (((((lon + 180) % 360) + 360) % 360) / 360) * n;
	const projectedY = ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
	const y = Math.max(0, Math.min(n - 1e-9, projectedY));
	return { tile: { x: Math.floor(x), y: Math.floor(y), z }, u: x % 1, v: y % 1 };
};
