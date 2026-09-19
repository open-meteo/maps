import { get } from 'svelte/store';

import {
	type DomainMetaDataJson,
	VARIABLE_PREFIX,
	getFallbackDomainValue
} from '@openmeteo/weather-map-layer';
import { toast } from 'svelte-sonner';

import { loading } from '$lib/stores/preferences';
import {
	inProgress as iP,
	latest as l,
	metaJson as mJ,
	modelRun as mR,
	time as t
} from '$lib/stores/time';
import { domain as d, selectedDomain, variable as v } from '$lib/stores/variables';

import { BASE_URI, fmtModelRun } from './helpers';
import { formatISOWithoutTimezone } from './time-format';
import { findTimeStep } from './time-utils';
import { updateUrl } from './url';

/**
 * Load the run info (latest/in-progress) for the selected domain — for a
 * seamless composite, that of its fallback domain. Returns false when the load
 * failed (an error toast has been shown) or when the domain changed while the
 * requests were in flight; callers must not continue to meta.json then, and a
 * domain without available data can never block the UI.
 */
export const getInitialMetaData = async (): Promise<boolean> => {
	const domain = get(selectedDomain);

	try {
		const domainValue = get(d);
		const metaDomainValue = getFallbackDomainValue(domain);

		const [latestRes, inProgressRes] = await Promise.all([
			fetch(`${BASE_URI}/${metaDomainValue}/latest.json`),
			fetch(`${BASE_URI}/${metaDomainValue}/in-progress.json`)
		]);

		// The domain may have changed while these requests were in flight (e.g. the
		// initial persisted-domain load racing a URL-driven domain change). Discard the
		// stale response so it can't clobber the current domain's metadata.
		if (get(d) !== domainValue) return false;

		// Tolerate a missing latest OR in-progress: a freshly-running model may only
		// have in-progress (no completed `latest` yet). As long as one is available
		// the UI can proceed; only a total failure (both missing) is an error.
		l.set(latestRes.ok ? await latestRes.json() : undefined);
		iP.set(inProgressRes.ok ? await inProgressRes.json() : undefined);

		if (!get(l) && !get(iP)) throw new Error(`HTTP ${latestRes.status}`);
		return true;
	} catch (e) {
		loading.set(false);
		// Fixed id: the periodic refresh retries every few minutes, and a dead
		// server should update the one toast rather than stack a new one
		toast.error(`Could not load run info for ${domain.label}: ${(e as Error).message}`, {
			id: 'run-info-error'
		});
		return false;
	}
};

const toDate = (dateString: string | undefined): Date | undefined =>
	dateString ? new Date(dateString) : undefined;

const matchesModelRun = (referenceTime: Date | undefined, modelRun: Date): boolean =>
	referenceTime?.getTime() === modelRun.getTime();

const fetchMetaData = async (domain: string, modelRun: Date): Promise<DomainMetaDataJson> => {
	const url = `${BASE_URI}/${domain}/${fmtModelRun(modelRun)}/meta.json`;
	const res = await fetch(url);

	if (!res.ok) throw new Error(`HTTP ${res.status}`);

	return res.json();
};

/**
 * Resolve the metadata for the selected model run — for a seamless composite,
 * that of its fallback domain. Throws when the run info is unusable or the
 * meta.json load fails; use `tryGetMetaData` to surface that as a toast.
 */
export const getMetaData = async (): Promise<DomainMetaDataJson> => {
	const metaDomain = getFallbackDomainValue(get(selectedDomain));

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
	if (!modelRun) throw new Error('no model run available');

	const result: DomainMetaDataJson = matchesModelRun(latestReferenceTime, modelRun)
		? (latest as DomainMetaDataJson)
		: matchesModelRun(inProgressReferenceTime, modelRun)
			? (inProgress as DomainMetaDataJson)
			: await fetchMetaData(metaDomain, modelRun);

	result.valid_times.sort();
	return result;
};

/**
 * `getMetaData`, but a failed meta.json load surfaces as an error toast
 * instead of an exception; returns undefined so callers can bail out.
 */
export const tryGetMetaData = async (): Promise<DomainMetaDataJson | undefined> => {
	try {
		return await getMetaData();
	} catch (e) {
		loading.set(false);
		toast.error(`Could not load metadata: ${(e as Error).message}`, { id: 'metadata-error' });
		return undefined;
	}
};

// Full metadata refresh for a domain: fetches the latest/in-progress run info
// and the run's meta.json, clamps the selected time to the valid times in the
// metadata (falling back to the first valid time), and re-matches the
// variable. Bails out if a newer domain change superseded this load while
// metadata was being fetched, so we don't commit another domain's
// metadata/time. A failed load is already surfaced as an error toast; it
// clears the metadata so the UI can't keep driving off the previous domain's
// valid times, and bails out without blocking so another domain can be picked.
export const loadDomainMetaData = async (newDomain: string) => {
	const ok = await getInitialMetaData();
	if (get(d) !== newDomain) return;
	const meta = ok ? await tryGetMetaData() : undefined;
	if (get(d) !== newDomain) return;
	if (!meta) {
		mJ.set(undefined);
		loading.set(false);
		return;
	}
	mJ.set(meta);

	const timeSteps = meta.valid_times.map((validTime: string) => new Date(validTime));
	const timeStep = findTimeStep(get(t), timeSteps) ?? timeSteps[0];
	t.set(timeStep);
	updateUrl('time', formatISOWithoutTimezone(timeStep));

	matchVariableOrFirst();
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
