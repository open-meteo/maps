import { get } from 'svelte/store';

import {
	type DomainMetaDataJson,
	VARIABLE_PREFIX,
	getFallbackDomainValue
} from '@openmeteo/weather-map-layer';

import { loading } from '$lib/stores/preferences';
import { inProgress as iP, latest as l, metaJson as mJ, modelRun as mR } from '$lib/stores/time';
import { selectedDomain, variable as v } from '$lib/stores/variables';

import { fmtModelRun, getBaseUri } from './helpers';

/**
 * Loads latest/in-progress metadata for the current domain. Returns `false`
 * (and clears the loading state) instead of throwing when the request fails, so
 * a domain without available data can never block the UI.
 */
export const getInitialMetaData = async (): Promise<boolean> => {
	try {
		const metaDomainValue = getFallbackDomainValue(get(selectedDomain));
		const uri = getBaseUri(metaDomainValue);

		const [latestRes, inProgressRes] = await Promise.all([
			fetch(`${uri}/data_spatial/${metaDomainValue}/latest.json`),
			fetch(`${uri}/data_spatial/${metaDomainValue}/in-progress.json`)
		]);

		for (const res of [latestRes, inProgressRes]) {
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			if (res.url.includes('latest.json')) l.set(await res.json());
			if (res.url.includes('in-progress.json')) iP.set(await res.json());
		}
		return true;
	} catch {
		loading.set(false);
		return false;
	}
};

const toDate = (dateString: string | undefined): Date | undefined =>
	dateString ? new Date(dateString) : undefined;

const matchesModelRun = (referenceTime: Date | undefined, modelRun: Date): boolean =>
	referenceTime?.getTime() === modelRun.getTime();

const fetchMetaData = async (
	uri: string,
	domain: string,
	modelRun: Date
): Promise<DomainMetaDataJson> => {
	const url = `${uri}/data_spatial/${domain}/${fmtModelRun(modelRun)}/meta.json`;
	const res = await fetch(url);

	if (!res.ok) throw new Error(`HTTP ${res.status}`);

	return res.json();
};

/**
 * Resolves the metadata for the selected model run. Returns `undefined` (and
 * clears the loading state) instead of throwing when the request fails.
 */
export const getMetaData = async (): Promise<DomainMetaDataJson | undefined> => {
	try {
		const metaDomain = getFallbackDomainValue(get(selectedDomain));
		const uri = getBaseUri(metaDomain);

		const latest = get(l);
		const latestReferenceTime = toDate(latest?.reference_time);

		if (get(mR) === undefined) {
			mR.set(latestReferenceTime);
		}
		const modelRun = get(mR) as Date;

		const inProgress = get(iP);
		const inProgressReferenceTime = toDate(inProgress?.reference_time);

		const result: DomainMetaDataJson = matchesModelRun(latestReferenceTime, modelRun)
			? (latest as DomainMetaDataJson)
			: matchesModelRun(inProgressReferenceTime, modelRun)
				? (inProgress as DomainMetaDataJson)
				: await fetchMetaData(uri, metaDomain, modelRun);

		result.valid_times.sort();
		return result;
	} catch {
		loading.set(false);
		return undefined;
	}
};

export const matchVariableOrFirst = () => {
	const variable = get(v);
	const metaJson = get(mJ);
	if (!metaJson || metaJson.variables.includes(variable)) return;

	let matched: string | undefined;
	const prefix = variable.match(VARIABLE_PREFIX)?.groups?.prefix;

	if (prefix) {
		matched = metaJson.variables.find((mv) => mv.startsWith(prefix));
	}

	v.set(matched ?? metaJson.variables[0]);
};
