import { interpolateHsl, color } from 'd3';

import type { ColorScale, Interpolator, Variable } from '$lib/types';

import { noInterpolation, interpolateLinear, interpolate2DHermite } from './interpolations';

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

type ColorScales = {
	[key: string]: ColorScale;
};

const precipScale: ColorScale = {
	min: 0,
	max: 20,
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
	scalefactor: 1,
	colors: [
		...interpolateColorScaleHSL(['#c0392b', '#d35400', '#f1c40f', '#16a085', '#2980b9'], 6000)
	],
	interpolationMethod: 'none',
	unit: 'm'
};

export const colorScales: ColorScales = {
	cape: {
		min: 0,
		max: 4000,
		scalefactor: 1,
		colors: [
			...interpolateColorScaleHSL(
				['#009392', '#39b185', '#9ccb86', '#e9e29c', '#eeb479', '#e88471', '#cf597e'],
				4000
			)
		],
		interpolationMethod: 'linear',
		unit: ''
	},
	cloud: {
		min: 0,
		max: 100,
		scalefactor: 1,
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
		scalefactor: 2,
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
		scalefactor: 1,
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
		scalefactor: 1,
		colors: [
			...interpolateColorScaleHSL(
				['#009392', '#39b185', '#9ccb86', '#e9e29c', '#eeb479', '#e88471', '#cf597e'],
				1000
			)
		],
		interpolationMethod: 'linear',
		unit: 'W/m^2'
	},
	temperature: {
		min: -40,
		max: 60,
		scalefactor: 1,
		colors: [
			...interpolateColorScaleHSL(['purple', 'blue'], 40), // -40° to 0°
			...interpolateColorScaleHSL(['blue', 'green'], 16), // 0° to 16°
			...interpolateColorScaleHSL(['green', 'orange'], 12), // 0° to 28°
			...interpolateColorScaleHSL(['orange', 'red'], 14), // 28° to 42°
			...interpolateColorScaleHSL(['red', 'purple'], 18) // 42° to 60°
		],
		interpolationMethod: 'linear',
		unit: 'C°'
	},
	thunderstorm: {
		min: 0,
		max: 100,
		scalefactor: 1,
		colors: [
			...interpolateColorScaleHSL(['blue', 'green'], 33), //
			...interpolateColorScaleHSL(['green', 'orange'], 33), //
			...interpolateColorScaleHSL(['orange', 'red'], 34) //
		],
		interpolationMethod: 'linear',
		unit: '%'
	},
	uv: {
		min: 0,
		max: 12,
		scalefactor: 1,
		colors: [
			...interpolateColorScaleHSL(
				['#009392', '#39b185', '#9ccb86', '#e9e29c', '#eeb479', '#e88471', '#cf597e'],
				12
			)
		],
		interpolationMethod: 'linear',
		unit: ''
	},
	wind: {
		min: 0,
		max: 40,
		scalefactor: 1,
		colors: [
			...interpolateColorScaleHSL(['blue', 'green'], 10), // 0 to 10kn
			...interpolateColorScaleHSL(['green', 'orange'], 10), // 10 to 20kn
			...interpolateColorScaleHSL(['orange', 'red'], 20) // 20 to 40kn
		],
		interpolationMethod: 'linear',
		unit: 'm/s'
	}
};

export function getColorScale(variable: Variable) {
	return (
		colorScales[variable.value] ??
		colorScales[variable.value.split('_')[0]] ??
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
