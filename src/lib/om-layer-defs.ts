/**
 * Channel builders: pure functions turning one chart source into the
 * FrameManager channels that render it. All inputs (urls, styles, dark mode)
 * are explicit parameters — no store reads at add time.
 *
 * A raster channel is one WebGLTile layer on the adapter's DataTile source,
 * a vector channel one VectorTile layer styled per feature. The insertion
 * point of the MapLibre app is a zIndex band here (see map-controls), so
 * `beforeLayer` is accepted and ignored.
 */
import VectorTileLayer from 'ol/layer/VectorTile';
import WebGLTile from 'ol/layer/WebGLTile';
import { Circle, Fill, Stroke, Style, Text } from 'ol/style';

import {
	arrowStyleFor,
	contourStyleFor,
	defaultArrowStyle,
	defaultContourStyle
} from '$lib/chart-styles';

import { Z_INDEX } from './map-controls';
import { omAdapter } from './om-adapter';

import type { ChannelLayerDef, FrameChannel } from '$lib/frame-manager';
import type { FeatureLike } from 'ol/Feature';
import type DataTile from 'ol/source/DataTile';
import type VectorTileSource from 'ol/source/VectorTile';

export const rasterChannel = (
	sourceKey: string,
	url: string,
	opacity: number,
	_beforeLayer: string
): FrameChannel => ({
	// Opacity is part of the identity: retained frames must not be reused
	// with a different per-source opacity. The sourceKey (variable@domain)
	// keeps same-variable sources from different domains apart.
	key: `${sourceKey}:raster:${opacity}`,
	url,
	layers: [
		{
			id: 'raster',
			peakOpacity: opacity,
			zIndex: Z_INDEX.raster,
			create: () =>
				new WebGLTile({
					source: omAdapter.createRasterSource(url) as unknown as DataTile,
					opacity: 0
				})
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

/** Web mercator zoom of a view resolution (256 px tiles). */
const zoomOf = (resolution: number): number => Math.log2(156543.03392804097 / resolution);

export const vectorChannel = (
	sourceKey: string,
	url: string,
	options: VectorChannelOptions
): FrameChannel => {
	const { contours, arrows, grid, dark } = options;
	const lineWidth = options.lineWidth ?? 1;

	const labelFill = new Fill({ color: dark ? 'rgba(255,255,255, 0.8)' : 'rgba(0,0,0, 0.7)' });
	const gridFill = new Fill({ color: 'orange' });

	// The MapLibre app's layer definitions, evaluated per feature
	const style = (feature: FeatureLike, resolution: number): Style | Style[] | undefined => {
		const layerName = feature.get('layer') as string | undefined;
		const value = Number(feature.get('value')) || 0;
		switch (layerName) {
			case 'contours': {
				if (!contours) return undefined;
				const line = contourStyleFor(value, defaultContourStyle, dark);
				return [
					new Style({ stroke: new Stroke({ color: line.color, width: line.width * lineWidth }) }),
					new Style({
						text: new Text({
							text: String(feature.get('value') ?? ''),
							placement: 'line',
							// Contours from a quantized field change direction at almost
							// every cell; the default 45° would abort placement there
							maxAngle: (110 * Math.PI) / 180,
							repeat: 300,
							font: '11px "Noto Sans", sans-serif',
							fill: labelFill,
							offsetY: -6
						})
					})
				];
			}
			case 'grid': {
				if (!grid) return undefined;
				const radius = Math.min(10, 0.1 * Math.pow(1.5, zoomOf(resolution)));
				return new Style({ image: new Circle({ radius, fill: gridFill }) });
			}
			default: {
				if (!arrows) return undefined;
				const line = arrowStyleFor(value, defaultArrowStyle, dark);
				return new Style({
					stroke: new Stroke({ color: line.color, width: line.width * lineWidth, lineCap: 'round' })
				});
			}
		}
	};

	const layers: ChannelLayerDef[] = [
		{
			id: 'vector',
			peakOpacity: 1,
			zIndex: Z_INDEX.vector,
			create: () =>
				new VectorTileLayer({
					source: omAdapter.createVectorTileSource(url) as unknown as VectorTileSource,
					style,
					declutter: true,
					opacity: 0
				})
		}
	];

	return {
		// Line width and stack placement are part of the identity, like
		// raster opacity
		key: `${sourceKey}:vector:${lineWidth}${options.inline ? ':inline' : ''}`,
		url,
		layers
	};
};
