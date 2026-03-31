import { get } from 'svelte/store';

import { type DomainMetaDataJson, VARIABLE_PREFIX } from '@openmeteo/weather-map-layer';

import { loading } from '$lib/stores/preferences';
import { inProgress as iP, latest as l, metaJson as mJ, modelRun as mR } from '$lib/stores/time';
import { domain as d, selectedDomain, variable as v } from '$lib/stores/variables';

import { fmtModelRun, getBaseUri } from './helpers';

export const getInitialMetaData = async () => {
	const domain = get(selectedDomain);
	const uri = getBaseUri(domain.value);

	const [latestRes, inProgressRes] = await Promise.all([
		fetch(`${uri}/data_spatial/${domain.value}/latest.json`),
		fetch(`${uri}/data_spatial/${domain.value}/in-progress.json`)
	]);

	for (const res of [latestRes, inProgressRes]) {
		if (!res.ok) {
			loading.set(false);
			throw new Error(`HTTP ${res.status}`);
		}
		if (res.url.includes('latest.json')) l.set(await res.json());
		if (res.url.includes('in-progress.json')) iP.set(await res.json());
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

	if (!res.ok) {
		loading.set(false);
		throw new Error(`HTTP ${res.status}`);
	}

	return res.json();
};

export const getMetaData = async (): Promise<DomainMetaDataJson> => {
	const domain = get(d);
	const uri = getBaseUri(domain);

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
			: await fetchMetaData(uri, domain, modelRun);

	result.valid_times.sort();
	return result;
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
