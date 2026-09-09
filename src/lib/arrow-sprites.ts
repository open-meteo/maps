/**
 * Sprites for the icon renderer: the arrow and barb shapes drawn into images
 * the map can place as symbols. Symbols are laid out in screen space, so they
 * keep their size while the map zooms, where tile geometry grows with the tile
 * until the next zoom level loads.
 *
 * The shape is fixed per image, so speed has to be bucketed: an arrow per step
 * of its length ramp, a barb per 5 knots. `windIconExpression` builds the
 * expression that picks the right one per point.
 */
import {
	ARROW_LATTICE,
	type ArrowStyle,
	BARB_LATTICE,
	TILE_PX
} from '@openmeteo/weather-map-layer';

import { MS_TO_KNOTS, SHAPE_UNITS, arrowShape, barbShape } from '$lib/arrow-shapes';
import { BARB_OPACITY_RANGE, arrowLevelFor, defaultArrowStyle } from '$lib/chart-styles';
import { alphaOfCssColor, rescaleInto } from '$lib/color';

import type * as maplibregl from 'maplibre-gl';

/**
 * Everything here is snapped to a whole number of cells per tile, so a size
 * and a spacing are always an exact divisor of the tile: what the settings
 * report is what the tile is built with, with nothing lost to rounding on the
 * way. The base counts are the geometry renderer's own, so an icon at scale 1
 * is drawn exactly as large as the same shape in a tile at an integer zoom.
 * (Between zoom levels the tile is scaled up to 1.41x, and only the geometry
 * follows.)
 */
const baseLattice = (style: ArrowStyle): number =>
	style === 'barb' ? BARB_LATTICE : ARROW_LATTICE;

const clampLattice = (count: number): number => Math.min(120, Math.max(4, Math.round(count)));

/** Cells across a tile at the visitor's size setting: bigger icon, fewer. */
export const windIconLattice = (style: ArrowStyle, scale = 1): number =>
	clampLattice(baseLattice(style) / scale);

/** Icon box for `style`, exactly one cell of that lattice. */
export const windIconSizePx = (style: ArrowStyle, scale = 1): number =>
	TILE_PX / windIconLattice(style, scale);

/**
 * Points across a tile: the icon lattice, tightened by the packing setting.
 * Below 1 the boxes overlap, which they can afford, since neither shape
 * reaches its corners.
 */
export const windPointLattice = (style: ArrowStyle, scale = 1, packing = 0.85): number =>
	clampLattice(windIconLattice(style, scale) / packing);

/** Pixels between two icons, i.e. one cell of the point lattice. */
export const windIconSpacing = (style: ArrowStyle, scale = 1, packing = 0.85): number =>
	TILE_PX / windPointLattice(style, scale, packing);
/** Barbs are drawn at one weight, arrows follow the style's width ramp. */
export const BARB_LINE_WIDTH = 1.3;

/**
 * Stroke width in shape units, i.e. what a legend drawing the shape at
 * `SHAPE_UNITS` needs to match the line the map draws at `sizePx`.
 */
export const strokeUnits = (lineWidth: number, sizePx: number): number =>
	(lineWidth * SHAPE_UNITS) / sizePx;

/** Colour the map draws a shape in, for legends: the opacity ramps included. */
export const shapeColor = (style: ArrowStyle, speed: number, dark: boolean): string =>
	style === 'barb' ? barbColor(speed, dark) : arrowColor(speed, dark);

/** Stroke a legend should use for a shape, matching the map's own weight. */
export const shapeStrokeUnits = (style: ArrowStyle, speed: number): number =>
	style === 'barb'
		? strokeUnits(BARB_LINE_WIDTH, windIconSizePx('barb'))
		: strokeUnits(arrowLevelFor(defaultArrowStyle, speed).width, windIconSizePx('arrow'));

/** Bounds for the size and packing settings. */
export const ICON_SCALE_RANGE = { min: 0.6, max: 1.8, step: 0.05 };
export const ICON_PACKING_RANGE = { min: 0.6, max: 2, step: 0.05 };

/** Speeds (m/s) an arrow image is drawn for: every step either ramp takes. */
const ARROW_BUCKETS = [0, 1, 2, 3, 4, 5, 10, 20];
/**
 * Barb images, up to a violent hurricane: the calm circle, the bare staff, and
 * then every 5 knots. `from` is where the bucket starts, i.e. the speed that
 * rounds into it.
 */
const BARB_BUCKETS: { knots: number; from: number }[] = [
	{ knots: 0, from: 0 },
	{ knots: 1, from: 0.5 },
	...Array.from({ length: 24 }, (_, i) => ({ knots: (i + 1) * 5, from: (i + 1) * 5 - 2.5 }))
];

const levels = () => [...defaultArrowStyle.levels].sort((a, b) => a.minSpeed - b.minSpeed);

const levelFor = (speed: number) => arrowLevelFor(defaultArrowStyle, speed);

const arrowColor = (speed: number, dark: boolean): string => {
	const level = levelFor(speed);
	return dark ? level.darkColor : level.lightColor;
};

const barbColor = (speed: number, dark: boolean): string => {
	const alphas = levels().map((level) =>
		alphaOfCssColor(dark ? level.darkColor : level.lightColor)
	);
	const level = levelFor(speed);
	const alpha = alphaOfCssColor(dark ? level.darkColor : level.lightColor);
	const rgb = dark ? '255,255,255' : '0,0,0';
	return `rgba(${rgb},${rescaleInto(alpha, alphas, BARB_OPACITY_RANGE).toFixed(3)})`;
};

// The size is part of the id: resizing registers a new set rather than
// silently keeping the images already on the map
const imageId = (
	style: ArrowStyle,
	dark: boolean,
	sizePx: number,
	bucket: number,
	mirrored = false
): string =>
	`wind-${style}-${dark ? 'dark' : 'light'}-${sizePx.toFixed(1)}-${bucket}${mirrored ? '-s' : ''}`;

/**
 * Draw one shape into an image. `mirrored` flips it across the staff, for
 * barbs in the southern hemisphere.
 */
const drawSprite = (
	polylines: number[][][],
	filled: number[][][],
	color: string,
	lineWidth: number,
	sizePx: number,
	mirrored: boolean
): { width: number; height: number; data: Uint8Array } | undefined => {
	const ratio = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1)));
	// The image is grown by the stroke: a shape reaching its box would other-
	// wise have the outer half of its line cut off by the image edge, which at
	// small sizes (where the stroke is a bigger share of the box) is most of it
	const pad = Math.ceil(lineWidth);
	const box = Math.round(sizePx * ratio);
	const side = box + 2 * Math.round(pad * ratio);
	const canvas = document.createElement('canvas');
	canvas.width = side;
	canvas.height = side;
	const context = canvas.getContext('2d');
	if (!context) return undefined;

	// Draw in shape units; the transform takes them to device pixels
	const scale = box / SHAPE_UNITS;
	const offset = Math.round(pad * ratio);
	context.setTransform(
		mirrored ? -scale : scale,
		0,
		0,
		scale,
		mirrored ? side - offset : offset,
		offset
	);
	context.strokeStyle = color;
	context.fillStyle = color;
	context.lineWidth = strokeUnits(lineWidth, sizePx);
	context.lineCap = 'round';
	context.lineJoin = 'round';

	for (const line of polylines) {
		context.beginPath();
		line.forEach(([x, y], i) => (i === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
		context.stroke();
	}
	for (const shape of filled) {
		context.beginPath();
		shape.forEach(([x, y], i) => (i === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
		context.closePath();
		context.fill();
		context.stroke();
	}

	const image = context.getImageData(0, 0, side, side);
	return { width: side, height: side, data: new Uint8Array(image.data) };
};

/**
 * Register every image the icon renderer needs for `style`. Cheap to call
 * again: images already on the map are left alone, which is what keeps this
 * safe to run on each channel rebuild and after a basemap style reload wipes
 * them.
 */
export const registerWindSprites = (
	map: maplibregl.Map,
	style: ArrowStyle,
	dark: boolean,
	scale = 1
): void => {
	const ratio = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1)));
	const sizePx = windIconSizePx(style, scale);

	const add = (id: string, sprite: ReturnType<typeof drawSprite>) => {
		if (!sprite || map.hasImage(id)) return;
		map.addImage(id, sprite, { pixelRatio: ratio });
	};

	if (style === 'arrow') {
		for (const speed of ARROW_BUCKETS) {
			const id = imageId('arrow', dark, sizePx, speed);
			if (map.hasImage(id)) continue;
			add(
				id,
				drawSprite(
					arrowShape(speed),
					[],
					arrowColor(speed, dark),
					levelFor(speed).width,
					sizePx,
					false
				)
			);
		}
		return;
	}

	for (const bucket of BARB_BUCKETS) {
		const shape = barbShape(bucket.knots);
		const color = barbColor(bucket.knots / MS_TO_KNOTS, dark);
		for (const mirrored of [false, true]) {
			const id = imageId('barb', dark, sizePx, bucket.knots, mirrored);
			if (map.hasImage(id)) continue;
			add(id, drawSprite(shape.lines, shape.pennants, color, BARB_LINE_WIDTH, sizePx, mirrored));
		}
	}
};

/** Image to use per point: a step over the speed, in the shape's own unit. */
export const windIconExpression = (
	style: ArrowStyle,
	dark: boolean,
	scale = 1
): maplibregl.ExpressionSpecification => {
	const sizePx = windIconSizePx(style, scale);
	if (style === 'arrow') {
		const steps = ARROW_BUCKETS.slice(1).flatMap((speed) => [
			speed,
			imageId('arrow', dark, sizePx, speed)
		]);
		return [
			'step',
			['get', 'value'],
			imageId('arrow', dark, sizePx, ARROW_BUCKETS[0]),
			...steps
		] as maplibregl.ExpressionSpecification;
	}

	// Barbs are bucketed in knots and mirrored south of the equator, where the
	// barbs sit on the other side of the staff. `value` is in m/s, so the
	// bucket bounds are converted back.
	const barbStep = (mirrored: boolean): maplibregl.ExpressionSpecification => {
		const steps = BARB_BUCKETS.slice(1).flatMap((bucket) => [
			bucket.from / MS_TO_KNOTS,
			imageId('barb', dark, sizePx, bucket.knots, mirrored)
		]);
		return [
			'step',
			['get', 'value'],
			imageId('barb', dark, sizePx, BARB_BUCKETS[0].knots, mirrored),
			...steps
		] as maplibregl.ExpressionSpecification;
	};
	return ['case', ['>=', ['get', 'latitude'], 0], barbStep(false), barbStep(true)];
};

/** Rotation per point: an arrow points downwind, a barb's staff upwind. */
export const windRotateExpression = (style: ArrowStyle): maplibregl.ExpressionSpecification =>
	style === 'arrow' ? ['+', ['get', 'direction'], 180] : ['get', 'direction'];
