import { interpolateHsl, color } from 'd3';

import type { ColorScale, ColorScales, Interpolator, Variable } from '$lib/types';

import { noInterpolation, interpolateLinear, interpolate2DHermite } from './interpolations';

const OPACITY = Number(import.meta.env.VITE_TILE_OPACITY);

export const getColor = (colorScale: ColorScale, px: number): number[] => {
	return colorScale.colors[
		Math.min(
			colorScale.colors.length - 1,
			Math.max(0, Math.floor((px - colorScale.min) * colorScale.scalefactor))
		)
	];
};

export const getOpacity = (v: string, px: number, dark: boolean): number => {
	if (v == 'cloud_cover' || v == 'thunderstorm_probability') {
		// scale opacity with percentage
		return 255 * (px ** 1.5 / 1000) * (OPACITY / 100);
	} else if (v.startsWith('cloud_base')) {
		// scale cloud base to 20900m
		return Math.min(1 - px / 20900, 1) * 255 * (OPACITY / 100);
	} else if (v.startsWith('precipitation')) {
		// scale opacity with precip values below 1.5mm
		return Math.min(px / 1.5, 1) * 255 * (OPACITY / 100);
	} else if (v.startsWith('wind')) {
		// scale opacity with wind values below 14kn
		return Math.min((px - 2) / 12, 1) * 255 * (OPACITY / 100);
	} else {
		// else set the opacity with env variable and deduct 20% for darkmode
		return 255 * (dark ? OPACITY / 100 - 0.2 : OPACITY / 100);
	}
};

export function getColorScale(variable: Variable['value']) {
	return (
		colorScales[variable] ??
		colorScales[variable.split('_')[0]] ??
		colorScales[variable.split('_')[0] + '_' + variable.split('_')[1]] ??
		colorScales['temperature']
	);
}

export function getInterpolator(colorScale: ColorScale): Interpolator {
	if (!colorScale.interpolationMethod || colorScale.interpolationMethod === 'none') {
		return noInterpolation;
	} else if (colorScale.interpolationMethod === 'linear') {
		return interpolateLinear;
	} else if (colorScale.interpolationMethod === 'hermite2d') {
		return interpolate2DHermite;
	} else {
		// default is linear
		return interpolateLinear;
	}
}

function interpolateColorScaleHSL(colors: Array<string>, steps: number) {
	const segments = colors.length - 1;
	const stepsPerSegment = Math.floor(steps / segments);
	const remainder = steps % segments;

	const rgbArray: number[][] = [];

	for (let i = 0; i < segments; i++) {
		const startColor = colors[i];
		const endColor = colors[i + 1];
		const interpolate = interpolateHsl(startColor, endColor);

		const numSteps = stepsPerSegment + (i < remainder ? 1 : 0);

		for (let j = 0; j < numSteps; j++) {
			const t = j / (numSteps - 1); // range [0, 1]
			let c = color(interpolate(t));
			if (c) {
				c = c.rgb();
				rgbArray.push([c.r, c.g, c.b]);
			}
		}
	}

	return rgbArray;
}

const precipScale: ColorScale = {
	min: 0,
	max: 20,
	steps: 20,
	scalefactor: 1,
	colors: [
		...interpolateColorScaleHSL(['blue', 'green'], 5), // 0 to 5mm
		...interpolateColorScaleHSL(['green', 'orange'], 5), // 5 to 10mm
		...interpolateColorScaleHSL(['orange', 'red'], 10) // 10 to 20mm
	],
	interpolationMethod: 'linear',
	unit: 'mm'
};

const convectiveCloudScale: ColorScale = {
	min: 0,
	max: 6000,
	steps: 100,
	scalefactor: 1 / 60,
	colors: [
		...interpolateColorScaleHSL(['#c0392b', '#d35400', '#f1c40f', '#16a085', '#2980b9'], 100)
	],
	interpolationMethod: 'none',
	unit: 'm'
};

export const colorScales: ColorScales = {
	cape: {
		min: 0,
		max: 4000,
		steps: 100,
		scalefactor: 100 / (4000 - 0),
		colors: [
			...interpolateColorScaleHSL(
				['#009392', '#39b185', '#9ccb86', '#e9e29c', '#eeb479', '#e88471', '#cf597e'],
				100
			)
		],
		interpolationMethod: 'linear',
		unit: ''
	},
	cloud_base: {
		min: 0,
		max: 20900,
		steps: 100,
		scalefactor: 100 / (20900 - 0),
		colors: [
			...interpolateColorScaleHSL(['#FFF', '#c3c2c2'], 100) // 0 to 20900m
		],
		interpolationMethod: 'linear',
		unit: 'm'
	},
	cloud_cover: {
		min: 0,
		max: 100,
		steps: 100,
		scalefactor: 100 / (100 - 0),
		colors: [
			...interpolateColorScaleHSL(['#FFF', '#c3c2c2'], 100) // 0 to 100%
		],
		interpolationMethod: 'linear',
		unit: '%'
	},
	convective_cloud_top: convectiveCloudScale,
	convective_cloud_base: convectiveCloudScale,
	precipitation: precipScale,
	pressure: {
		min: 950,
		max: 1050,
		steps: 50,
		scalefactor: 50 / (1050 - 950),
		colors: [
			...interpolateColorScaleHSL(['#4444FF', '#FFFFFF'], 25), // 950 to 1000hPa
			...interpolateColorScaleHSL(['#FFFFFF', '#FF4444'], 25) // 1000hPa to 1050hPa
		],
		interpolationMethod: 'linear',
		unit: 'hPa'
	},
	rain: precipScale,
	relative: {
		min: 0,
		max: 100,
		steps: 100,
		scalefactor: 100 / (100 - 0),
		colors: [
			...interpolateColorScaleHSL(
				['#009392', '#39b185', '#9ccb86', '#e9e29c', '#eeb479', '#e88471', '#cf597e'].reverse(),
				100
			)
		],
		interpolationMethod: 'linear',
		unit: '%'
	},
	shortwave: {
		min: 0,
		max: 1000,
		steps: 100,
		scalefactor: 100 / (1000 - 0),
		colors: [
			...interpolateColorScaleHSL(
				['#009392', '#39b185', '#9ccb86', '#e9e29c', '#eeb479', '#e88471', '#cf597e'],
				100
			)
		],
		interpolationMethod: 'linear',
		unit: 'W/m^2'
	},
	temperature: {
		min: -40,
		max: 60,
		steps: 100,
		scalefactor: 100 / (60 - -40),
		colors: [
			...interpolateColorScaleHSL(['purple', 'blue'], 40), // -40°C to 0°C
			...interpolateColorScaleHSL(['blue', 'green'], 16), // 0°Cto 16°C
			...interpolateColorScaleHSL(['green', 'orange'], 12), // 0°C to 28°C
			...interpolateColorScaleHSL(['orange', 'red'], 14), // 28°C to 42°C
			...interpolateColorScaleHSL(['red', 'purple'], 18) // 42°C to 60°C
		],
		interpolationMethod: 'linear',
		unit: 'C°'
	},
	thunderstorm: {
		min: 0,
		max: 100,
		steps: 100,
		scalefactor: 100 / (100 - 0),
		colors: [
			...interpolateColorScaleHSL(['blue', 'green'], 33), //
			...interpolateColorScaleHSL(['green', 'orange'], 33), //
			...interpolateColorScaleHSL(['orange', 'red'], 34) //
		],
		interpolationMethod: 'linear',
		unit: '%'
	},
	swell: {
		min: 0,
		max: 10,
		steps: 50,
		scalefactor: 50 / (10 - 0),
		colors: [
			...interpolateColorScaleHSL(['blue', 'green'], 10), // 0 to 2m
			...interpolateColorScaleHSL(['green', 'orange'], 20), // 2 to 6m
			...interpolateColorScaleHSL(['orange', 'red'], 20) // 6 to 10m
		],
		interpolationMethod: 'linear',
		unit: 'm'
	},
	uv: {
		min: 0,
		max: 12,
		steps: 12,
		scalefactor: 12 / (12 - 0),
		colors: [
			...interpolateColorScaleHSL(
				['#009392', '#39b185', '#9ccb86', '#e9e29c', '#eeb479', '#e88471', '#cf597e'],
				12
			)
		],
		interpolationMethod: 'linear',
		unit: ''
	},
	wave: {
		min: 0,
		max: 10,
		steps: 50,
		scalefactor: 50 / (10 - 0),
		colors: [
			...interpolateColorScaleHSL(['blue', 'green'], 10), // 0 to 2m
			...interpolateColorScaleHSL(['green', 'orange'], 20), // 2 to 6m
			...interpolateColorScaleHSL(['orange', 'red'], 20) // 6 to 10m
		],
		interpolationMethod: 'linear',
		unit: 'm'
	},
	wind: {
		min: 0,
		max: 40,
		steps: 40,
		scalefactor: 40 / (40 - 0),
		colors: [
			...interpolateColorScaleHSL(['blue', 'green'], 10), // 0 to 10kn
			...interpolateColorScaleHSL(['green', 'orange'], 10), // 10 to 20kn
			...interpolateColorScaleHSL(['orange', 'red'], 20) // 20 to 40kn
		],
		interpolationMethod: 'linear',
		unit: 'm/s'
	}
};
