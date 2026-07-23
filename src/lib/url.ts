import { tick } from 'svelte';
import { get } from 'svelte/store';

import {
	type AnyDomain,
	type Domain,
	type DomainMetaDataJson,
	closestModelRun,
	defaultOmProtocolSettings,
	domainOptions,
	domainStep,
	getFallbackDomain,
	isSeamlessDomain,
	resolveConcreteDomain
} from '@openmeteo/weather-map-layer';
import { mode } from 'mode-watcher';

import { replaceState } from '$app/navigation';

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

import {
	CLIP_COUNTRIES_PARAM,
	parseClipCountriesParam,
	serializeClipCountriesParam
} from './clipping';
import { fmtModelRun, fmtSelectedTime, getBaseUri, hashValue } from './helpers';
import { clippingCountryCodes } from './stores/clipping';
import { omProtocolSettings } from './stores/om-protocol-settings';
import { formatISOUTCWithZ, parseISOWithoutTimezone } from './time-format';

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

	const variable = params.get('variable');
	if (variable) {
		v.set(variable);
	} else if (get(v) !== 'temperature_2m') {
		url.searchParams.set('variable', get(v));
	}

	const arrowsRaw = params.get('arrows');
	if (arrowsRaw !== null) {
		vectorOptions.arrows = arrowsRaw === 'true';
	} else if (!vectorOptions.arrows) {
		url.searchParams.set('arrows', String(vectorOptions.arrows));
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
};

let cachedClippingJson = '';
let cachedClippingHash = '';
let cachedColorJson = '';
let cachedColorHash = '';

const memorisedHash = (json: string, cachedJson: string, cachedHash: string) => {
	if (json === cachedJson) return { json, hash: cachedHash };
	return { json, hash: hashValue(json) };
};

export const getOMUrl = () => {
	const domain = get(d);
	const base = `${getBaseUri(domain)}/data_spatial/${domain}`;
	const modelRun = get(mR);
	if (!modelRun) return undefined;
	const selectedTime = get(time);

	let result = `${base}/${fmtModelRun(modelRun)}/${fmtSelectedTime(selectedTime)}.om`;
	result += `?variable=${get(v)}`;

	if (mode.current === 'dark') result += '&dark=true';
	const vectorOptions = get(vO);
	if (vectorOptions.grid) result += '&grid=true';
	if (vectorOptions.arrows) result += '&arrows=true';
	if (vectorOptions.contours) result += '&contours=true';
	if (vectorOptions.contours && !vectorOptions.breakpoints)
		result += `&intervals=${vectorOptions.contourInterval}`;

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
		const clippingJson = JSON.stringify(omProtocolSettingsState.clippingOptions);
		const cached = memorisedHash(clippingJson, cachedClippingJson, cachedClippingHash);
		cachedClippingJson = cached.json;
		cachedClippingHash = cached.hash;
		result += `&clipping_options_hash=${cached.hash}`;
	}

	const colorJson = JSON.stringify(omProtocolSettingsState.colorScales);
	if (
		omProtocolSettingsState.colorScales !== undefined &&
		colorJson !== JSON.stringify(defaultOmProtocolSettings.colorScales)
	) {
		const cached = memorisedHash(colorJson, cachedColorJson, cachedColorHash);
		cachedColorJson = cached.json;
		cachedColorHash = cached.hash;
		result += `&color_hash=${cached.hash}`;
	}

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

	const host = getBaseUri(anyDomain.value);
	const urls = new Set<string>();
	for (const domainValue of domainValues) {
		for (const [run, t] of stamps) {
			urls.add(`${host}/data_spatial/${domainValue}/${fmtModelRun(run)}/${fmtSelectedTime(t)}.om`);
		}
	}
	return [...urls];
};
