/**
 * Channel builders: pure functions turning one chart source into the
 * FrameManager channels that render it. All inputs (urls, styles, dark mode)
 * are explicit parameters — no store reads at add time.
 *
 * Leaflet has no style layers: a raster channel is one canvas GridLayer, a
 * vector channel is one GridLayer that draws the MVT features itself, styled
 * per feature by a callback. The insertion point of the MapLibre app is a
 * pane here (see map-controls), so `beforeLayer` is accepted and ignored.
 */
import {
	arrowStyleFor,
	contourStyleFor,
	defaultArrowStyle,
	defaultContourStyle
} from '$lib/chart-styles';

import { RASTER_PANE, VECTOR_PANE } from './map-controls';
import { omAdapter } from './om-adapter';

import type { ChannelLayerDef, FrameChannel } from '$lib/frame-manager';
import type { ArrowStyle } from '@openmeteo/weather-map-layer';
import type L from 'leaflet';

export const rasterChannel = (
	variable: string,
	url: string,
	opacity: number,
	_beforeLayer: string
): FrameChannel => ({
	// Opacity is part of the identity: retained frames must not be reused
	// with a different per-source opacity.
	key: `${variable}:raster:${opacity}`,
	url,
	layers: [
		{
			id: 'raster',
			peakOpacity: opacity,
			create: () =>
				omAdapter.createTileLayer(url, { pane: RASTER_PANE, opacity: 0 }) as unknown as L.GridLayer
		}
	]
});

/**
 * Barbs are drawn at one thin, even weight instead of the arrows' width ramp:
 * the shape already carries the speed, and it is the thin line that keeps the
 * individual barbs apart at map scale. The colour still follows the speed, on
 * the shallower ramp in `buildBarbColorExpr`.
 */
export const BARB_LINE_WIDTH = 1.3;

export interface VectorChannelOptions {
	contours: boolean;
	arrows: boolean;
	/** Shape of the arrows; barbs are styled differently to stay readable. */
	arrowStyle: ArrowStyle;
	grid: boolean;
	dark: boolean;
	beforeLayer: string;
	/** Width multiplier for contour and arrow lines. Default 1. */
	lineWidth?: number;
	/** Rendered inside the raster stack (see ChartSource.inlineVectors). */
	inline?: boolean;
}

/** What the adapter's canvas renderer takes per feature. */
interface CanvasLineStyle {
	strokeStyle: string;
	lineWidth: number;
	lineCap?: CanvasLineCap;
}

export const vectorChannel = (
	variable: string,
	url: string,
	options: VectorChannelOptions
): FrameChannel => {
	const { contours, arrows, arrowStyle, grid, dark } = options;
	const lineWidth = options.lineWidth ?? 1;

	// Contour labels have no canvas equivalent in the adapter; the lines,
	// arrows and grid points render with the MapLibre app's colours and widths
	const style = (
		properties: Record<string, unknown>,
		layerName: string
	): CanvasLineStyle | null => {
		const value = Number(properties['value']) || 0;
		switch (layerName) {
			case 'contours': {
				if (!contours) return null;
				const line = contourStyleFor(value, defaultContourStyle, dark);
				return { strokeStyle: line.color, lineWidth: line.width * lineWidth };
			}
			case 'grid':
				return grid ? { strokeStyle: 'orange', lineWidth: 2 } : null;
			default: {
				if (!arrows) return null;
				const line = arrowStyleFor(value, defaultArrowStyle, dark);
				return { strokeStyle: line.color, lineWidth: line.width * lineWidth, lineCap: 'round' };
			}
		}
	};

	const layers: ChannelLayerDef[] = [
		{
			id: 'vector',
			peakOpacity: 1,
			create: () =>
				omAdapter.createVectorTileLayer(url, {
					pane: VECTOR_PANE,
					opacity: 0,
					style
				}) as unknown as L.GridLayer
		}
	];

	return {
		// Line width, arrow shape and stack placement are part of the identity,
		// like raster opacity
		key: `${variable}:vector:${lineWidth}:${arrowStyle}${options.inline ? ':inline' : ''}`,
		url,
		layers
	};
};
