import { get } from 'svelte/store';

import { type DomainMetaDataJson, VARIABLE_PREFIX } from '@openmeteo/mapbox-layer';

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

export const getMetaData = async (): Promise<DomainMetaDataJson> => {
	const domain = get(d);
	const uri = getBaseUri(domain);
	let modelRun = get(mR);

	const latest = get(l);
	const latestReferenceTime = latest?.reference_time ? new Date(latest.reference_time) : undefined;

	if (modelRun === undefined) {
		mR.set(latestReferenceTime);
		modelRun = get(mR) as Date;
	}

	if (latestReferenceTime && modelRun.getTime() === latestReferenceTime.getTime()) {
		return latest as DomainMetaDataJson;
	}

	const inProgress = get(iP);
	const inProgressReferenceTime = inProgress?.reference_time
		? new Date(inProgress.reference_time)
		: undefined;

	if (inProgressReferenceTime && modelRun.getTime() === inProgressReferenceTime.getTime()) {
		return inProgress as DomainMetaDataJson;
	}

	const metaJsonUrl = `${uri}/data_spatial/${domain}/${fmtModelRun(modelRun)}/meta.json`;
	const res = await fetch(metaJsonUrl);

	if (!res.ok) {
		loading.set(false);
		throw new Error(`HTTP ${res.status}`);
	}

	return res.json();
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
