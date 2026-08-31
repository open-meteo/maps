import { tick } from 'svelte';
import { get } from 'svelte/store';

import {
	type AnyDomain,
	type ArrowRender,
	type ArrowStyle,
	DEFAULT_ARROW_RENDER,
	DEFAULT_ARROW_STYLE,
	type Domain,
	type DomainMetaDataJson,
	VALID_ARROW_RENDERS,
	VALID_ARROW_STYLES,
	closestModelRun,
	defaultOmProtocolSettings,
	domainOptions,
	domainStep,
	getFallbackDomain,
	isSeamlessDomain,
	resolveConcreteDomain
} from '@openmeteo/weather-map-layer';
import { mode } from 'mode-watcher';
import { toast } from 'svelte-sonner';

import { replaceState } from '$app/navigation';

import {
	activeChart,
	applyPreset,
	isDefaultsPlainChart,
	setPlainVariable,
	setSources
} from '$lib/stores/chart';
import { epsMeta } from '$lib/stores/eps';
import { map as m } from '$lib/stores/map';
import {
	type Preferences,
	colorBlend as cB,
	completeDefaultValues,
	interpolation as iP,
	preferences as p,
	tileSize as tS,
	url as u
} from '$lib/stores/preferences';
import { modelRun as mR, modelRunLocked as mRL, time } from '$lib/stores/time';
import { domain as d, variable as v } from '$lib/stores/variables';
import { vectorOptions as vO } from '$lib/stores/vector';

import { windPointLattice } from '$lib/arrow-sprites';
import { parseSources, serializeSources } from '$lib/chart-encoding';
import { getChartPreset } from '$lib/chart-presets';

import {
	CLIP_COUNTRIES_PARAM,
	parseClipCountriesParam,
	serializeClipCountriesParam
} from './clipping';
import { BASE_URI, fmtModelRun, fmtSelectedTime, hashValue } from './helpers';
import { clippingCountryCodes } from './stores/clipping';
import { omProtocolSettings } from './stores/om-protocol-settings';
import { sunShadow as sS } from './stores/sun';
import { formatISOUTCWithZ, parseISOWithoutTimezone } from './time-format';
import { findTimeStep } from './time-utils';

import type { ChartSource, ChartState } from '$lib/chart-types';

export const updateUrl = async (
	urlParam?: string,
	newValue?: string,
	defaultValue?: string
): Promise<void> => {
	const url = get(u);
	if (!url) return;

	if (!defaultValue && urlParam && completeDefaultValues[urlParam]) {
		defaultValue = String(completeDefaultValues[urlParam]);
	}

	if (urlParam) {
		if (newValue && newValue !== defaultValue) {
			url.searchParams.set(urlParam, newValue);
		} else {
			url.searchParams.delete(urlParam);
		}
	}

	await tick();
	let fullUrl: string;
	try {
		const map = get(m);
		if (map) {
			fullUrl = String(url) + map._hash.getHashString();
		} else {
			fullUrl = String(url);
		}
	} catch {
		fullUrl = String(url);
	}

	// Commas and colons are legal in query values; keep them readable
	// (the `sources` chart encoding uses both).
	fullUrl = fullUrl.replace(/%2C/gi, ',').replace(/%3A/gi, ':');

	replaceState(fullUrl, {});
};

export const urlParamsToPreferences = () => {
	const url = get(u);
	const preferences = get(p);
	const vectorOptions = get(vO);

	const params = new URLSearchParams(url.search);

	const urlModelTime = params.get('model_run');
	if (urlModelTime?.length === 15) {
		mR.set(parseISOWithoutTimezone(urlModelTime));
		mRL.set(true);
	}

	const urlTime = params.get('time');
	if (urlTime?.length === 15) {
		time.set(parseISOWithoutTimezone(urlTime));
	}

	const syncBoolParam = (paramKey: string, prefKey: keyof Preferences, writeIfDefault: boolean) => {
		const raw = params.get(paramKey);
		if (raw !== null) {
			preferences[prefKey] = raw === 'true';
		} else if (writeIfDefault ? true : preferences[prefKey]) {
			url.searchParams.set(paramKey, String(preferences[prefKey]));
		}
	};

	syncBoolParam('globe', 'globe', false);
	syncBoolParam('terrain', 'terrain', false);
	syncBoolParam('hillshade', 'hillshade', false);
	syncBoolParam('clip_water', 'clipWater', false);

	const domain = params.get('domain');
	if (domain) {
		d.set(domain);
	} else if (get(d) !== 'dwd_icon') {
		url.searchParams.set('domain', get(d));
	}

	const arrowsRaw = params.get('arrows');
	if (arrowsRaw !== null) {
		vectorOptions.arrows = arrowsRaw === 'true';
	} else if (!vectorOptions.arrows) {
		url.searchParams.set('arrows', String(vectorOptions.arrows));
	}

	const arrowStyleRaw = params.get('arrow_style');
	if (arrowStyleRaw !== null) {
		if (VALID_ARROW_STYLES.includes(arrowStyleRaw as ArrowStyle)) {
			vectorOptions.arrowStyle = arrowStyleRaw as ArrowStyle;
		}
	} else if (vectorOptions.arrowStyle !== DEFAULT_ARROW_STYLE) {
		url.searchParams.set('arrow_style', vectorOptions.arrowStyle);
	}

	const arrowRenderRaw = params.get('arrow_render');
	if (arrowRenderRaw !== null) {
		if (VALID_ARROW_RENDERS.includes(arrowRenderRaw as ArrowRender)) {
			vectorOptions.arrowRender = arrowRenderRaw as ArrowRender;
		}
	} else if (vectorOptions.arrowRender !== DEFAULT_ARROW_RENDER) {
		url.searchParams.set('arrow_render', vectorOptions.arrowRender);
	}

	const contoursRaw = params.get('contours');
	if (contoursRaw !== null) {
		vectorOptions.contours = contoursRaw === 'true';
	} else if (vectorOptions.contours) {
		url.searchParams.set('contours', String(vectorOptions.contours));
	}

	const intervalRaw = params.get('interval');
	if (intervalRaw !== null) {
		vectorOptions.contourInterval = Number(intervalRaw);
	} else if (vectorOptions.contourInterval !== 2) {
		url.searchParams.set('interval', String(vectorOptions.contourInterval));
	}

	const sun = get(sS);
	sun.shadow = params.get('sun_shadow') === 'true';
	const sunOpacityRaw = params.get('sun_opacity');
	if (sunOpacityRaw !== null) sun.opacity = Number(sunOpacityRaw);
	const sunGradientRaw = params.get('sun_gradient');
	if (sunGradientRaw !== null) sun.gradient = Number(sunGradientRaw);
	const sunColorRaw = params.get('sun_color');
	if (sunColorRaw !== null) sun.color = sunColorRaw;
	sS.set(sun);

	const clipCountries = parseClipCountriesParam(params.get(CLIP_COUNTRIES_PARAM));
	if (clipCountries.length > 0) {
		clippingCountryCodes.set(clipCountries);
	} else {
		const currentCodes = get(clippingCountryCodes);
		const serialized = serializeClipCountriesParam(currentCodes);
		if (serialized) {
			url.searchParams.set(CLIP_COUNTRIES_PARAM, serialized);
		}
	}

	vO.set(vectorOptions);
	p.set(preferences);

	// Chart parsing precedence: explicit `sources` > `chart` preset id > legacy
	// `variable` param. Runs after the vector params above are committed since a
	// plain chart is built from those persisted defaults.
	const sourcesRaw = params.get('sources');
	const chartRaw = params.get('chart');
	const parsedSources = sourcesRaw ? parseSources(sourcesRaw) : undefined;
	const chartPresetFromUrl = chartRaw ? getChartPreset(chartRaw) : undefined;
	if (sourcesRaw && !parsedSources) toast('Invalid sources parameter, ignoring it.');
	if (chartRaw && !chartPresetFromUrl) toast('Unknown chart: ' + chartRaw);

	if (parsedSources) {
		setSources(parsedSources);
	} else if (chartPresetFromUrl) {
		applyPreset(chartPresetFromUrl.id);
	} else {
		const variableRaw = params.get('variable');
		if (variableRaw) {
			// Explicit variable param means plain mode, also when a custom chart
			// was persisted (its URL form is the `sources` param instead)
			setPlainVariable(variableRaw);
		} else if (!isDefaultsPlainChart(get(activeChart))) {
			// Persisted custom chart: reflect it in the URL so it survives reloads
			url.searchParams.set('sources', serializeSources(get(activeChart).sources));
		} else if (get(v) !== 'temperature_2m') {
			url.searchParams.set('variable', get(v));
		}
	}
};

// Hashes for the clipping/color URL params, re-derived only when the settings
// object identity changes: both are replaced wholesale on modification, and
// stringifying them per URL build ran once per source per store change. The
// default color scales never change, so their JSON is computed once.
const DEFAULT_COLOR_SCALES_JSON = JSON.stringify(defaultOmProtocolSettings.colorScales);

let cachedClippingRef: unknown;
let cachedClippingHash = '';
let cachedColorRef: unknown;
let cachedColorHash = '';
let cachedColorIsDefault = true;

/**
 * Build the om:// source URL (without protocol prefix) for one chart source.
 * The path part (domain/model run/time) and the global render params are
 * shared by all sources; variable and vector flags are per source.
 */
export const getOmUrlForSource = (source: ChartSource): string | undefined => {
	// A cross-domain (EPS) source uses the sibling's own model run and clamps
	// the time to its own steps; unavailable until its metadata has loaded.
	const eps = source.domain ? get(epsMeta) : undefined;
	if (source.domain && eps?.domain !== source.domain) return undefined;

	const domain = eps?.domain ?? get(d);
	const base = `${BASE_URI}/${domain}`;
	const modelRun = eps?.referenceTime ?? get(mR);
	if (!modelRun) return undefined;
	let selectedTime = get(time);
	if (eps) selectedTime = (findTimeStep(selectedTime, eps.validTimes) as Date) ?? selectedTime;

	let result = `${base}/${fmtModelRun(modelRun)}/${fmtSelectedTime(selectedTime)}.om`;
	result += `?variable=${source.variable}`;

	if (mode.current === 'dark') result += '&dark=true';
	const vectorOptions = get(vO);
	if (vectorOptions.grid) result += '&grid=true';
	if (source.arrows) {
		result += '&arrows=true';
		if (vectorOptions.arrowStyle !== 'arrow') result += `&arrow_style=${vectorOptions.arrowStyle}`;
		if (vectorOptions.arrowRender !== 'line') {
			result += `&arrow_render=${vectorOptions.arrowRender}`;
			// The tile lattice is the one the renderer sized its icons against
			result += `&arrow_points=${windPointLattice(
				vectorOptions.arrowStyle,
				vectorOptions.arrowIconScale,
				vectorOptions.arrowPacking
			)}`;
		}
	}
	if (source.contours) result += '&contours=true';
	if (source.contours && source.contourInterval !== undefined)
		result += `&intervals=${source.contourInterval}`;

	const tileSize = get(tS);
	if (tileSize !== 256) result += `&tile_size=${tileSize}`;

	const interpolation = get(iP);
	if (interpolation !== 'linear') result += `&interpolation=${interpolation}`;

	if (get(cB)) result += `&color_blend=true`;

	const omProtocolSettingsState = get(omProtocolSettings);
	if (
		omProtocolSettingsState.clippingOptions !== undefined &&
		omProtocolSettingsState.clippingOptions !== defaultOmProtocolSettings.clippingOptions
	) {
		if (omProtocolSettingsState.clippingOptions !== cachedClippingRef) {
			cachedClippingRef = omProtocolSettingsState.clippingOptions;
			cachedClippingHash = hashValue(JSON.stringify(omProtocolSettingsState.clippingOptions));
		}
		result += `&clipping_options_hash=${cachedClippingHash}`;
	}

	if (omProtocolSettingsState.colorScales !== undefined) {
		if (omProtocolSettingsState.colorScales !== cachedColorRef) {
			cachedColorRef = omProtocolSettingsState.colorScales;
			const colorJson = JSON.stringify(omProtocolSettingsState.colorScales);
			cachedColorIsDefault = colorJson === DEFAULT_COLOR_SCALES_JSON;
			cachedColorHash = hashValue(colorJson);
		}
		if (!cachedColorIsDefault) result += `&color_hash=${cachedColorHash}`;
	}

	return result;
};

/** Legacy single-variable URL: a plain source from the global stores. */
export const getOMUrl = (): string | undefined => {
	const vectorOptions = get(vO);
	return getOmUrlForSource({
		variable: get(v),
		raster: true,
		arrows: vectorOptions.arrows,
		contours: vectorOptions.contours,
		contourInterval:
			vectorOptions.contours && !vectorOptions.breakpoints
				? vectorOptions.contourInterval
				: undefined
	});
};

/**
 * Write the active chart to the URL. A defaults-derived plain chart keeps the
 * legacy `variable` param (backward-compatible links); an unmodified preset
 * uses `chart=<id>`; anything else the explicit `sources` encoding.
 */
export const syncChartToUrl = async (chart: ChartState): Promise<void> => {
	const url = get(u);
	if (!url) return;

	url.searchParams.delete('chart');
	url.searchParams.delete('sources');
	url.searchParams.delete('variable');

	if (isDefaultsPlainChart(chart)) {
		const variable = chart.sources[0].variable;
		if (variable !== completeDefaultValues.variable) {
			url.searchParams.set('variable', variable);
		}
	} else if (chart.presetId) {
		url.searchParams.set('chart', chart.presetId);
	} else {
		url.searchParams.set('sources', serializeSources(chart.sources));
	}

	await updateUrl();
};

// Source URL for the sun cycle shadow overlay; undefined when disabled.
// Options that are not set in the page URL fall back to the protocol defaults.
// timeOverride renders the shadow for a different moment than the selected
// time, used for the minute-resolution hover preview in the time selector.
export const getSunUrl = (timeOverride?: Date): string | undefined => {
	const sun = get(sS);
	if (!sun.shadow) return undefined;

	let result = `sun://shadow?time=${formatISOUTCWithZ(timeOverride ?? get(time))}`;
	if (sun.opacity !== undefined) result += `&opacity=${sun.opacity}`;
	if (sun.gradient !== undefined) result += `&gradient=${sun.gradient}`;
	if (sun.color !== undefined) result += `&color=${sun.color}`;
	return result;
};

/** The valid times one step before/after `date`, from metadata if present. */
const prevNextDates = (
	date: Date,
	step: Domain['time_interval'],
	metaJson: DomainMetaDataJson | undefined
): [prev: Date, next: Date] => {
	if (metaJson) {
		const idx = metaJson.valid_times.findIndex((s) => s === formatISOUTCWithZ(date));
		return [new Date(metaJson.valid_times[idx + 1]), new Date(metaJson.valid_times[idx - 1])];
	}
	return [domainStep(date, step, 'backward'), domainStep(date, step, 'forward')];
};

/**
 * OM file URLs to cache-warm around the current selection, as a grid of
 * (model-run, valid-time) stamps × domain paths:
 *
 * - Regular domain: the previous/next timestep files of the domain itself, so
 *   stepping through time is instant.
 * - Seamless composite: those same timesteps plus the current one, for every
 *   concrete sub-layer — including ones the viewport gate skips because they are
 *   off-screen — so panning to a regional model is instant too.
 *
 * The seamless protocol builds each sub-layer URL by swapping only the
 * `/data_spatial/<domain>/` segment of the request URL, keeping the composite's
 * host and model-run path. Deriving every stamp from the fallback domain mirrors
 * that, so the warmed files match exactly what the protocol fetches. Each
 * timestep uses its closest model run, clamped to the currently published run so
 * we never point past data that exists.
 */
export const getNextOmUrls = (
	anyDomain: AnyDomain,
	metaJson: DomainMetaDataJson | undefined
): string[] => {
	const fallback = getFallbackDomain(anyDomain, domainOptions);
	const date = get(time);
	if (!fallback || isNaN(date.getTime())) return [];

	const currentModelRun = metaJson ? new Date(metaJson.reference_time) : undefined;
	const runFor = (t: Date): Date => {
		const run = closestModelRun(t, fallback.model_interval);
		return currentModelRun && run > currentModelRun ? currentModelRun : run;
	};

	const [prevDate, nextDate] = prevNextDates(date, fallback.time_interval, metaJson);
	const stamps = [prevDate, nextDate]
		.filter((t) => !isNaN(t.getTime()))
		.map((t): [run: Date, validTime: Date] => [runFor(t), t]);
	let domainValues = [fallback.value];

	if (isSeamlessDomain(anyDomain)) {
		// Off-screen sub-layers have not even loaded the current timestep yet, so
		// warm it as well — with the selected model run, as the protocol requests it.
		const selectedRun = get(mR);
		if (!selectedRun) return [];
		stamps.unshift([selectedRun, date]);
		domainValues = anyDomain.layers
			.map((layer) => resolveConcreteDomain(layer.domainValue, domainOptions)?.value)
			.filter((value): value is string => value !== undefined);
	}

	const urls = new Set<string>();
	for (const domainValue of domainValues) {
		for (const [run, t] of stamps) {
			urls.add(`${BASE_URI}/${domainValue}/${fmtModelRun(run)}/${fmtSelectedTime(t)}.om`);
		}
	}
	return [...urls];
};
