import type { PhasePoint, Tile } from './model';
import type {
	Domain,
	InterpolationMethod,
	RenderableColorScale,
	getCachedResolvedClipping,
	getRanges
} from '@openmeteo/weather-map-layer';

export type PhaseClipping = ReturnType<typeof getCachedResolvedClipping>;

export interface PhaseWeather {
	domain: Domain;
	ranges?: ReturnType<typeof getRanges>;
	rates?: Float32Array;
	heights?: Float32Array;
}

export type PhaseJob = {
	tile: Tile;
	colorScale: RenderableColorScale;
	colorBlend: boolean;
	interpolation: InterpolationMethod;
	fill: boolean;
	contours: boolean;
	weather: PhaseWeather;
	clipping: PhaseClipping;
	point?: { lat: number; lon: number; u: number; v: number };
};

export type PhaseMessage = (PhaseJob & { id: number }) | { cancel: number };
export type PhaseResult =
	{ id: number; data: ImageBitmap | PhasePoint } | { id: number; error: string };
