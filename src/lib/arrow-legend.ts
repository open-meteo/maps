/**
 * Colours and stroke weights for drawing the arrow and barb shapes in a
 * legend, taken from the styles the map draws them with so the legend cannot
 * drift away from the map.
 */
import {
	ARROW_LATTICE,
	type ArrowStyle,
	BARB_LATTICE,
	TILE_PX
} from '@openmeteo/weather-map-layer';

import { SHAPE_UNITS } from '$lib/arrow-shapes';
import { BARB_OPACITY_RANGE, arrowLevelFor, defaultArrowStyle } from '$lib/chart-styles';
import { alphaOfCssColor, rescaleInto } from '$lib/color';
import { BARB_LINE_WIDTH } from '$lib/om-layer-defs';

/**
 * On-screen size of one lattice cell at an integer zoom, which is the size a
 * shape is drawn to fill in the tile.
 */
const cellPx = (style: ArrowStyle): number =>
	TILE_PX / (style === 'barb' ? BARB_LATTICE : ARROW_LATTICE);

/**
 * Stroke width in shape units, i.e. what a legend drawing the shape at
 * `SHAPE_UNITS` needs to match the line the map draws at `sizePx`.
 */
const strokeUnits = (lineWidth: number, sizePx: number): number =>
	(lineWidth * SHAPE_UNITS) / sizePx;

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

/** Colour the map draws a shape in, for legends: the opacity ramps included. */
export const shapeColor = (style: ArrowStyle, speed: number, dark: boolean): string =>
	style === 'barb' ? barbColor(speed, dark) : arrowColor(speed, dark);

/** Stroke a legend should use for a shape, matching the map's own weight. */
export const shapeStrokeUnits = (style: ArrowStyle, speed: number): number =>
	style === 'barb'
		? strokeUnits(BARB_LINE_WIDTH, cellPx('barb'))
		: strokeUnits(levelFor(speed).width, cellPx('arrow'));
