/**
 * Pure helpers for the chart model: URL (de)serialization of chart sources,
 * chart comparison/preset matching, and arrow-capability detection.
 *
 * URL grammar for the `sources` parameter (comma separated, one token per
 * source): `variable[:flags]` where flags is a concatenation of `r` (raster),
 * `a` (arrows) and `c` optionally followed by the contour interval.
 * A token without flags means raster only.
 * Example: `temperature_850hPa:rc2,geopotential_height_500hPa:c4`
 */
import { chartPresets } from '$lib/chart-presets';

import type { ChartPreset, ChartSource, ChartState } from '$lib/chart-types';

/**
 * Variables that can render arrows: the WML protocol only derives directions
 * for u/v components, speed/direction pairs and wave height/direction (see
 * DEFAULT_DERIVATION_RULES in weather-map-layer).
 */
export const variableSupportsArrows = (variable: string): boolean =>
	/_[uv]_(component|current)/.test(variable) ||
	/_(?:speed|direction)_/.test(variable) ||
	/wave_(?:height|direction)/.test(variable);

const serializeSource = (source: ChartSource): string => {
	let flags = '';
	if (source.raster) flags += 'r';
	if (source.arrows) flags += 'a';
	if (source.contours) flags += 'c' + (source.contourInterval ?? '');
	// A raster-only source matches the no-flags default, keep the URL short
	if (flags === 'r') return source.variable;
	return `${source.variable}:${flags}`;
};

export const serializeSources = (sources: ChartSource[]): string =>
	sources.map(serializeSource).join(',');

const SOURCE_TOKEN_REGEX = /^(?<variable>[a-z0-9_]+)(?::(?<flags>[a-z0-9.]*))?$/i;
const FLAGS_REGEX = /^(?:r|a|c(?<interval>[0-9]+(?:\.[0-9]+)?)?)*$/;

const parseSourceToken = (token: string): ChartSource | undefined => {
	const match = token.match(SOURCE_TOKEN_REGEX);
	if (!match?.groups) return undefined;

	const source: ChartSource = { variable: match.groups.variable };
	const flags = match.groups.flags;
	if (flags === undefined) {
		source.raster = true;
		return source;
	}
	if (!FLAGS_REGEX.test(flags)) return undefined;

	if (flags.includes('r')) source.raster = true;
	if (flags.includes('a')) source.arrows = true;
	const contourMatch = flags.match(/c(?<interval>[0-9]+(?:\.[0-9]+)?)?/);
	if (contourMatch) {
		source.contours = true;
		if (contourMatch.groups?.interval) {
			source.contourInterval = Number(contourMatch.groups.interval);
		}
	}
	return source;
};

/**
 * Parse a `sources` URL parameter. Returns undefined when any token is
 * malformed or no source renders anything. Duplicate variables are merged.
 */
export const parseSources = (raw: string): ChartSource[] | undefined => {
	const byVariable = new Map<string, ChartSource>();
	for (const token of raw.split(',')) {
		const source = parseSourceToken(token.trim());
		if (!source) return undefined;

		const existing = byVariable.get(source.variable);
		if (existing) {
			existing.raster ||= source.raster;
			existing.arrows ||= source.arrows;
			existing.contours ||= source.contours;
			existing.contourInterval ??= source.contourInterval;
		} else {
			byVariable.set(source.variable, source);
		}
	}

	const sources = [...byVariable.values()];
	if (!sources.length) return undefined;
	if (!sources.some((s) => s.raster || s.contours || s.arrows)) return undefined;
	return sources;
};

const sourceEquals = (a: ChartSource, b: ChartSource): boolean =>
	a.variable === b.variable &&
	!a.raster === !b.raster &&
	!a.contours === !b.contours &&
	!a.arrows === !b.arrows &&
	(a.contours ? a.contourInterval === b.contourInterval : true) &&
	a.opacity === b.opacity &&
	a.lineWidth === b.lineWidth &&
	!a.inlineVectors === !b.inlineVectors;

export const sourcesEqual = (a: ChartSource[], b: ChartSource[]): boolean =>
	a.length === b.length && a.every((source, i) => sourceEquals(source, b[i]));

/** Find the preset whose sources exactly match, if any. */
export const matchPreset = (sources: ChartSource[]): ChartPreset | undefined =>
	chartPresets.find((preset) => sourcesEqual(preset.sources, sources));

/**
 * A chart expressible through the legacy URL params (`variable`, `arrows`,
 * `contours`, `interval`): a single source with raster enabled.
 */
export const isPlainChart = (chart: ChartState): boolean =>
	chart.sources.length === 1 && !!chart.sources[0].raster;

export const cloneSources = (sources: ChartSource[]): ChartSource[] =>
	sources.map((source) => ({ ...source }));

/**
 * Drop the preset-file styling fields (opacity, lineWidth, inlineVectors);
 * they are not carried by the `sources` URL encoding — share styled charts
 * via their `chart=<preset>` link instead.
 */
export const stripSourceStyling = (sources: ChartSource[]): ChartSource[] =>
	sources.map(({ opacity: _opacity, lineWidth: _lineWidth, inlineVectors: _inline, ...rest }) => ({
		...rest
	}));
