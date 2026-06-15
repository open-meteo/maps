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
	completeDefaultValues,
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

/**
 * Build the OM file URL for a concrete domain at a specific valid time, picking
 * the closest model run (clamped to the current run when metadata is available).
 * Returns undefined for an invalid date.
 */
const omUrlForDomainAtTime = (
	domain: Domain,
	date: Date,
	metaJson: DomainMetaDataJson | undefined
): string | undefined => {
	if (isNaN(date.getTime())) return undefined;
	const base = `${getBaseUri(domain.value)}/data_spatial/${domain.value}`;
	const currentModelRun = metaJson ? new Date(metaJson.reference_time) : undefined;
	let modelRun = closestModelRun(date, domain.model_interval);
	if (currentModelRun && modelRun > currentModelRun) modelRun = currentModelRun;
	return `${base}/${fmtModelRun(modelRun)}/${fmtSelectedTime(date)}.om`;
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

export const getNextOmUrls = (
	_omUrl: string,
	anyDomain: AnyDomain,
	metaJson: DomainMetaDataJson | undefined
): [string | undefined, string | undefined] => {
	// For seamless domains, resolve the last (global fallback) backing domain for
	// URL construction and time-interval access.
	const domain = getFallbackDomain(anyDomain, domainOptions);
	if (!domain) return [undefined, undefined];

	const date = get(time);
	const [prevDate, nextDate] = prevNextDates(date, domain.time_interval, metaJson);

	return [
		omUrlForDomainAtTime(domain, prevDate, metaJson),
		omUrlForDomainAtTime(domain, nextDate, metaJson)
	];
};

/**
 * Cache-warmup URLs for a seamless composite domain.
 *
 * Returns, for every concrete sub-layer — including ones the viewport gate skips
 * because they are off-screen — the current, previous and next timestep file
 * URLs. Warming these file headers keeps panning to a regional model and stepping
 * through time instant; the sub-layer's actual data is still loaded on demand by
 * the protocol (and only when the layer is in view).
 *
 * `currentFallbackOmUrl` is the global fallback layer's current OM URL (i.e.
 * `state.omFileUrl` from the protocol). The seamless protocol derives each
 * sub-layer URL by swapping only the `/data_spatial/<domain>/` segment of the
 * request URL — keeping host, model-run path and valid time — so we mirror that
 * here exactly, guaranteeing the warmed file matches what the protocol fetches.
 *
 * Returns an empty list for non-seamless domains.
 */
export const getSeamlessWarmupOmUrls = (
	anyDomain: AnyDomain,
	currentFallbackOmUrl: string,
	metaJson: DomainMetaDataJson | undefined
): string[] => {
	if (!isSeamlessDomain(anyDomain)) return [];
	const fallback = getFallbackDomain(anyDomain, domainOptions);
	if (!fallback) return [];

	// Current + previous + next timestep file URLs for the global fallback domain,
	// exactly as the protocol requests/prefetches them.
	const fallbackTimestepUrls = [currentFallbackOmUrl, ...getNextOmUrls('', anyDomain, metaJson)];
	const fromSegment = `/data_spatial/${fallback.value}/`;

	const urls = new Set<string>();
	for (const layer of anyDomain.layers) {
		const sub = resolveConcreteDomain(layer.domainValue, domainOptions);
		if (!sub) continue;
		const toSegment = `/data_spatial/${sub.value}/`;
		for (const url of fallbackTimestepUrls) {
			if (url) urls.add(url.replace(fromSegment, toSegment));
		}
	}
	return [...urls];
};
