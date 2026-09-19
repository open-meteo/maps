/**
 * Channel builders: pure functions turning one chart source into the
 * FrameManager channels that render it. All inputs (urls, styles, dark mode,
 * insertion points) are explicit parameters — no store reads at add time.
 *
 * Mapbox has no custom protocols, so the sources come from the adapter: a
 * custom raster source per raster channel, and one GeoJSON source per vector
 * channel that mirrors the protocol's vector tiles for the viewport. The
 * vector layers select their features with a filter on the `layer` property
 * (the MVT layer name) instead of `source-layer`.
 */
import {
	buildArrowColorExpr,
	buildArrowWidthExpr,
	buildContourColorExpr,
	buildContourWidthExpr,
	defaultArrowStyle,
	defaultContourStyle
} from '$lib/chart-styles';

import { omAdapter } from './om-adapter';

import type { ChannelLayerDef, FrameChannel } from '$lib/frame-manager';
import type * as mapboxgl from 'mapbox-gl';

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
	addSource: (map, sourceId) => {
		map.addSource(
			sourceId,
			omAdapter.createRasterSource(url, {
				maxzoom: 14
			}) as unknown as mapboxgl.CustomSourceInterface<ImageBitmap>
		);
		return {
			remove: () => {
				if (map.getSource(sourceId)) map.removeSource(sourceId);
			}
		};
	},
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
	expr: mapboxgl.ExpressionSpecification,
	factor: number
): mapboxgl.ExpressionSpecification => (factor === 1 ? expr : ['*', factor, expr]);

/** Select the features of one MVT layer of the GeoJSON source. */
const layerFilter = (layer: string): mapboxgl.FilterSpecification => [
	'==',
	['get', 'layer'],
	layer
];

export const vectorChannel = (
	sourceKey: string,
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
						filter: layerFilter('wind-arrows'),
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
						filter: layerFilter('grid'),
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
						filter: layerFilter('contours'),
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
						filter: layerFilter('contours'),
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
		// Line width and stack placement are part of the identity, like
		// raster opacity
		key: `${sourceKey}:vector:${lineWidth}${options.inline ? ':inline' : ''}`,
		url,
		addSource: (map, sourceId) => {
			// The adapter's map interface is a structural subset that the typed
			// `addSource` overloads do not satisfy
			const handle = omAdapter.addVectorSource(
				map as unknown as Parameters<typeof omAdapter.addVectorSource>[0],
				sourceId,
				url
			);
			// The adapter's own first refresh is not exposed; this one supersedes
			// it and tells the frame when the viewport's features are in
			return { remove: handle.remove, ready: handle.refresh() };
		},
		layers
	};
};
