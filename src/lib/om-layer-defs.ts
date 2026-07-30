/**
 * Channel builders: pure functions turning one chart source into the
 * FrameManager channels that render it. All inputs (urls, styles, dark mode,
 * insertion points) are explicit parameters — no store reads at add time.
 */
import {
	buildArrowColorExpr,
	buildArrowWidthExpr,
	buildContourColorExpr,
	buildContourWidthExpr,
	defaultArrowStyle,
	defaultContourStyle
} from '$lib/chart-styles';

import type { ChannelLayerDef, FrameChannel } from '$lib/frame-manager';
import type * as maplibregl from 'maplibre-gl';

/** Opacity fade duration; matches the FrameManager cross-fade. */
const FADE_MS = 250;

export const rasterChannel = (
	variable: string,
	url: string,
	opacity: number,
	beforeLayer: string
): FrameChannel => ({
	// Opacity is part of the identity: retained frames must not be reused
	// with a different per-source opacity
	key: `${variable}:raster:${opacity}`,
	url,
	sourceSpec: { type: 'raster', url, maxzoom: 14 },
	layers: [
		{
			id: 'raster',
			opacityProp: 'raster-opacity',
			peakOpacity: opacity,
			beforeLayer,
			add: (map, sourceId, layerId, before) => {
				map.addLayer(
					{
						id: layerId,
						type: 'raster',
						source: sourceId,
						paint: {
							'raster-opacity': 0,
							'raster-opacity-transition': { duration: FADE_MS, delay: 0 }
						}
					},
					before
				);
			}
		}
	]
});

export interface VectorChannelOptions {
	contours: boolean;
	arrows: boolean;
	grid: boolean;
	dark: boolean;
	beforeLayer: string;
	/** Width multiplier for contour and arrow lines. Default 1. */
	lineWidth?: number;
	/** Rendered inside the raster stack (see ChartSource.inlineVectors). */
	inline?: boolean;
}

/** Scale a numeric width expression by a factor. */
const scaleWidth = (
	expr: maplibregl.ExpressionSpecification,
	factor: number
): maplibregl.ExpressionSpecification => (factor === 1 ? expr : ['*', factor, expr]);

export const vectorChannel = (
	variable: string,
	url: string,
	options: VectorChannelOptions
): FrameChannel => {
	const { contours, arrows, grid, dark, beforeLayer } = options;
	const lineWidth = options.lineWidth ?? 1;
	const layers: ChannelLayerDef[] = [];

	if (arrows) {
		layers.push({
			id: 'arrows',
			opacityProp: 'line-opacity',
			peakOpacity: 1,
			beforeLayer,
			add: (map, sourceId, layerId, before) => {
				map.addLayer(
					{
						id: layerId,
						type: 'line',
						source: sourceId,
						'source-layer': 'wind-arrows',
						paint: {
							'line-opacity': 0,
							'line-opacity-transition': { duration: FADE_MS, delay: 0 },
							'line-color': buildArrowColorExpr(defaultArrowStyle, dark),
							'line-width': scaleWidth(buildArrowWidthExpr(defaultArrowStyle), lineWidth)
						},
						layout: { 'line-cap': 'round' }
					},
					before
				);
			}
		});
	}

	if (grid) {
		layers.push({
			id: 'grid',
			opacityProp: 'circle-opacity',
			peakOpacity: 1,
			beforeLayer,
			add: (map, sourceId, layerId, before) => {
				map.addLayer(
					{
						id: layerId,
						type: 'circle',
						source: sourceId,
						'source-layer': 'grid',
						paint: {
							'circle-opacity': 0,
							'circle-opacity-transition': { duration: FADE_MS, delay: 0 },
							'circle-radius': ['interpolate', ['exponential', 1.5], ['zoom'], 0, 0.1, 12, 10],
							'circle-color': 'orange'
						}
					},
					before
				);
			}
		});
	}

	if (contours) {
		layers.push({
			id: 'contours',
			opacityProp: 'line-opacity',
			peakOpacity: 1,
			beforeLayer,
			add: (map, sourceId, layerId, before) => {
				map.addLayer(
					{
						id: layerId,
						type: 'line',
						source: sourceId,
						'source-layer': 'contours',
						paint: {
							'line-opacity': 0,
							'line-opacity-transition': { duration: FADE_MS, delay: 0 },
							'line-color': buildContourColorExpr(defaultContourStyle, dark),
							'line-width': scaleWidth(buildContourWidthExpr(defaultContourStyle), lineWidth)
						}
					},
					before
				);
			}
		});
		layers.push({
			id: 'contour-labels',
			opacityProp: 'text-opacity',
			peakOpacity: 1,
			beforeLayer,
			add: (map, sourceId, layerId, before) => {
				map.addLayer(
					{
						id: layerId,
						type: 'symbol',
						source: sourceId,
						'source-layer': 'contours',
						layout: {
							'symbol-placement': 'line-center',
							'symbol-spacing': 1,
							'text-font': ['Noto Sans Regular'],
							'text-field': ['to-string', ['get', 'value']],
							'text-padding': 1,
							'text-offset': [0, -0.6]
						},
						paint: {
							'text-opacity': 0,
							'text-opacity-transition': { duration: FADE_MS, delay: 0 },
							'text-color': dark ? 'rgba(255,255,255, 0.8)' : 'rgba(0,0,0, 0.7)'
						}
					},
					before
				);
			}
		});
	}

	return {
		// Line width and stack placement are part of the identity, like
		// raster opacity
		key: `${variable}:vector:${lineWidth}${options.inline ? ':inline' : ''}`,
		url,
		sourceSpec: { type: 'vector', url },
		layers
	};
};
