/**
 * Channel builders: pure functions turning one chart source into the
 * FrameManager channels that render it. All inputs (urls, styles, dark mode,
 * insertion points) are explicit parameters — no store reads at add time.
 */
import {
	buildArrowColorExpr,
	buildArrowWidthExpr,
	buildBarbColorExpr,
	buildContourColorExpr,
	buildContourWidthExpr,
	defaultArrowStyle,
	defaultContourStyle
} from '$lib/chart-styles';

import type { ChannelLayerDef, FrameChannel } from '$lib/frame-manager';
import type { ArrowStyle } from '@openmeteo/weather-map-layer';
import type * as maplibregl from 'maplibre-gl';

/** Opacity fade duration; matches the FrameManager cross-fade. */
const FADE_MS = 250;

export const rasterChannel = (
	sourceKey: string,
	url: string,
	opacity: number,
	beforeLayer: string
): FrameChannel => ({
	// Opacity is part of the identity: retained frames must not be reused
	// with a different per-source opacity. The sourceKey (variable@domain)
	// keeps same-variable sources from different domains apart.
	key: `${sourceKey}:raster:${opacity}`,
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
							'raster-opacity-transition': { duration: FADE_MS, delay: 0 },
							'raster-fade-duration': 0
						}
					},
					before
				);
			}
		}
	]
});

/**
 * Barbs are drawn at one thin, even weight instead of the arrows' width ramp:
 * the shape already carries the speed, and it is the thin line that keeps the
 * individual barbs apart at map scale. The colour still follows the speed, on
 * the shallower ramp in `buildBarbColorExpr`.
 */
const BARB_LINE_WIDTH = 1.3;

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

/** Scale a numeric width expression by a factor. */
const scaleWidth = (
	expr: maplibregl.ExpressionSpecification,
	factor: number
): maplibregl.ExpressionSpecification => (factor === 1 ? expr : ['*', factor, expr]);

export const vectorChannel = (
	sourceKey: string,
	url: string,
	options: VectorChannelOptions
): FrameChannel => {
	const { contours, arrows, arrowStyle, grid, dark, beforeLayer } = options;
	const lineWidth = options.lineWidth ?? 1;
	const layers: ChannelLayerDef[] = [];

	if (arrows) {
		const barbs = arrowStyle === 'barb';
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
							'line-color': barbs
								? buildBarbColorExpr(defaultArrowStyle, dark)
								: buildArrowColorExpr(defaultArrowStyle, dark),
							'line-width': barbs
								? BARB_LINE_WIDTH * lineWidth
								: scaleWidth(buildArrowWidthExpr(defaultArrowStyle), lineWidth)
						},
						layout: { 'line-cap': 'round' }
					},
					before
				);
			}
		});

		if (barbs) {
			// Pennants are solid on a printed plot, so they arrive as polygons in
			// their own source layer and are filled under their own outline
			layers.push({
				id: 'arrow-pennants',
				opacityProp: 'fill-opacity',
				peakOpacity: 1,
				beforeLayer,
				add: (map, sourceId, layerId, before) => {
					map.addLayer(
						{
							id: layerId,
							type: 'fill',
							source: sourceId,
							'source-layer': 'wind-barb-pennants',
							paint: {
								'fill-opacity': 0,
								'fill-opacity-transition': { duration: FADE_MS, delay: 0 },
								'fill-color': buildBarbColorExpr(defaultArrowStyle, dark),
								'fill-antialias': true
							}
						},
						before
					);
				}
			});
		}
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
							// `line`, not `line-center`: the latter tries the middle of
							// the line and nowhere else, so a contour whose middle
							// happens to wiggle gets no label at all. Repeating along
							// the line gives every straight-enough stretch a chance.
							'symbol-placement': 'line',
							'symbol-spacing': 300,
							// Contours from a quantized field change direction at
							// almost every cell. The default 45° aborts placement
							// there, which is why labels only appeared once a wiggle
							// was longer than a glyph, i.e. zoomed far in.
							'text-max-angle': 110,
							'text-font': ['Noto Sans Regular'],
							'text-field': ['to-string', ['get', 'value']],
							'text-size': 11,
							'text-padding': 2,
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
		// Line width, arrow shape and stack placement are part of the identity,
		// like raster opacity
		key: `${sourceKey}:vector:${lineWidth}:${arrowStyle}${options.inline ? ':inline' : ''}`,
		url,
		sourceSpec: { type: 'vector', url },
		layers
	};
};
