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

		// Tolerate a missing latest OR in-progress: a freshly-running model may only
		// have in-progress (no completed `latest` yet). As long as one is available
		// the UI can proceed; only a total failure (both missing) is an error.
		l.set(latestRes.ok ? await latestRes.json() : undefined);
		iP.set(inProgressRes.ok ? await inProgressRes.json() : undefined);

		if (!get(l) && !get(iP)) {
			loading.set(false);
			return false;
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
		const inProgress = get(iP);
		const latestReferenceTime = toDate(latest?.reference_time);
		const inProgressReferenceTime = toDate(inProgress?.reference_time);

		// Default the model run to latest when present, otherwise in-progress, so a
		// domain with only in-progress data still resolves to a valid run.
		if (get(mR) === undefined) {
			mR.set(latestReferenceTime ?? inProgressReferenceTime);
		}
		const modelRun = get(mR);
		if (!modelRun) {
			loading.set(false);
			return undefined;
		}

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
