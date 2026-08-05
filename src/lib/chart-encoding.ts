/**
 * Pure helpers for the chart model: URL (de)serialization of chart sources,
 * chart comparison/preset matching, and arrow-capability detection.
 *
 * URL grammar for the `sources` parameter (comma separated, one token per
 * source): `variable[@domain][:flags]` where flags is a concatenation of `r`
 * (raster), `a` (arrows), `c` optionally followed by the contour interval,
 * `i` (inline vectors), `o` followed by the opacity and `w` followed by the
 * contour line width. A token without flags means raster only. `@domain`
 * serves the source from another domain (EPS sibling) than the active one.
 * Example: `temperature_850hPa:rc2,geopotential_height_500hPa:c4w0.8`
 */
import { chartPresets } from '$lib/chart-presets';

import type { ChartPreset, ChartSource } from '$lib/chart-types';

/**
 * Variables that can render arrows: the WML protocol only derives directions
 * for u/v components, speed/direction pairs and wave height/direction (see
 * DEFAULT_DERIVATION_RULES in weather-map-layer).
 */
/**
 * Unique identity of a source within a chart: variable plus optional domain
 * (`temperature_2m` / `temperature_2m@dwd_icon_eps`). Used as URL merge key,
 * render-channel key and popup lookup key; contains no colon.
 */
export const sourceKey = (source: Pick<ChartSource, 'variable' | 'domain'>): string =>
	source.domain ? `${source.variable}@${source.domain}` : source.variable;

export const variableSupportsArrows = (variable: string): boolean =>
	/_[uv]_(component|current)/.test(variable) ||
	/_(?:speed|direction)_/.test(variable) ||
	/wave_(?:height|direction)/.test(variable);

const serializeSource = (source: ChartSource): string => {
	const variable = source.domain ? `${source.variable}@${source.domain}` : source.variable;
	let flags = '';
	if (source.raster) flags += 'r';
	if (source.arrows) flags += 'a';
	if (source.inlineVectors) flags += 'i';
	if (source.contours) flags += 'c' + (source.contourInterval ?? '');
	if (source.opacity !== undefined) flags += 'o' + source.opacity;
	if (source.lineWidth !== undefined) flags += 'w' + source.lineWidth;
	// A raster-only source matches the no-flags default, keep the URL short
	if (flags === 'r') return variable;
	return `${variable}:${flags}`;
};

export const serializeSources = (sources: ChartSource[]): string =>
	sources.map(serializeSource).join(',');

const SOURCE_TOKEN_REGEX =
	/^(?<variable>[a-z0-9_]+)(?:@(?<domain>[a-z0-9_]+))?(?::(?<flags>[a-z0-9.]*))?$/i;
const NUMBER = '[0-9]+(?:\\.[0-9]+)?';
const FLAGS_REGEX = new RegExp(`^(?:r|a|i|c(?:${NUMBER})?|o${NUMBER}|w${NUMBER})*$`);

const parseSourceToken = (token: string): ChartSource | undefined => {
	const match = token.match(SOURCE_TOKEN_REGEX);
	if (!match?.groups) return undefined;

	const source: ChartSource = { variable: match.groups.variable };
	if (match.groups.domain) source.domain = match.groups.domain;
	const flags = match.groups.flags;
	if (flags === undefined) {
		source.raster = true;
		return source;
	}
	if (!FLAGS_REGEX.test(flags)) return undefined;

	if (flags.includes('r')) source.raster = true;
	if (flags.includes('a')) source.arrows = true;
	if (flags.includes('i')) source.inlineVectors = true;
	const contourMatch = flags.match(/c(?<interval>[0-9]+(?:\.[0-9]+)?)?/);
	if (contourMatch) {
		source.contours = true;
		if (contourMatch.groups?.interval) {
			source.contourInterval = Number(contourMatch.groups.interval);
		}
	}
	const opacity = flags.match(/o(?<value>[0-9]+(?:\.[0-9]+)?)/)?.groups?.value;
	if (opacity) source.opacity = Number(opacity);
	const lineWidth = flags.match(/w(?<value>[0-9]+(?:\.[0-9]+)?)/)?.groups?.value;
	if (lineWidth) source.lineWidth = Number(lineWidth);
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

		const key = sourceKey(source);
		const existing = byVariable.get(key);
		if (existing) {
			existing.raster ||= source.raster;
			existing.arrows ||= source.arrows;
			existing.inlineVectors ||= source.inlineVectors;
			existing.contours ||= source.contours;
			existing.contourInterval ??= source.contourInterval;
			existing.opacity ??= source.opacity;
			existing.lineWidth ??= source.lineWidth;
		} else {
			byVariable.set(key, source);
		}
	}

	const sources = [...byVariable.values()];
	if (!sources.length) return undefined;
	if (!sources.some((s) => s.raster || s.contours || s.arrows)) return undefined;
	return sources;
};

const sourceEquals = (a: ChartSource, b: ChartSource): boolean =>
	a.variable === b.variable &&
	a.domain === b.domain &&
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

export const cloneSources = (sources: ChartSource[]): ChartSource[] =>
	sources.map((source) => ({ ...source }));
