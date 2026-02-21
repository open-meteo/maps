import { tick } from 'svelte';
import { get } from 'svelte/store';

import {
	type Domain,
	type DomainMetaDataJson,
	closestModelRun,
	domainStep
} from '@openmeteo/mapbox-layer';
import * as maplibregl from 'maplibre-gl';
import { mode } from 'mode-watcher';

import { pushState, replaceState } from '$app/navigation';
import { resolve } from '$app/paths';

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

import { fmtModelRun, fmtSelectedTime, getBaseUri } from './helpers';
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
	const map = get(m);
	const fullUrl = map
		? String(url) +
			(map as maplibregl.Map & { _hash: { getHashString(): string } })._hash.getHashString()
		: String(url);
	// eslint-disable-next-line svelte/no-navigation-without-resolve
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

	const timeSelectorRaw = params.get('time_selector');
	if (timeSelectorRaw !== null) {
		preferences.timeSelector = timeSelectorRaw === 'true';
	} else if (!preferences.timeSelector) {
		url.searchParams.set('time_selector', String(preferences.timeSelector));
	}

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

	vO.set(vectorOptions);
	p.set(preferences);
};

export const getOMUrl = () => {
	const domain = get(d);
	const base = `${getBaseUri(domain)}/data_spatial/${domain}`;
	const modelRun = get(mR) as Date;
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

	return result;
};

export const getNextOmUrls = (
	_omUrl: string,
	domain: Domain,
	metaJson: DomainMetaDataJson | undefined
): [string | undefined, string | undefined] => {
	const base = `https://map-tiles.open-meteo.com/data_spatial/${domain.value}`;
	const date = get(time);
	const dateString = formatISOUTCWithZ(date);

	let prevDate: Date;
	let nextDate: Date;

	if (metaJson) {
		const idx = metaJson.valid_times.findIndex((s) => s === dateString);
		prevDate = new Date(metaJson.valid_times[idx + 1]);
		nextDate = new Date(metaJson.valid_times[idx - 1]);
	} else {
		prevDate = domainStep(date, domain.time_interval, 'backward');
		nextDate = domainStep(date, domain.time_interval, 'forward');
	}

	const currentModelRun = metaJson ? new Date(metaJson.reference_time) : undefined;

	const clampRun = (run: Date): Date =>
		currentModelRun && run > currentModelRun ? currentModelRun : run;

	const prevModelRun = clampRun(closestModelRun(prevDate, domain.model_interval));
	const nextModelRun = clampRun(closestModelRun(nextDate, domain.model_interval));

	const prevUrl = !isNaN(prevDate.getTime())
		? `${base}/${fmtModelRun(prevModelRun)}/${fmtSelectedTime(prevDate)}.om`
		: undefined;
	const nextUrl = !isNaN(nextDate.getTime())
		? `${base}/${fmtModelRun(nextModelRun)}/${fmtSelectedTime(nextDate)}.om`
		: undefined;

	return [prevUrl, nextUrl];
};
