import { get } from 'svelte/store';

import { type DomainMetaDataJson, VARIABLE_PREFIX } from '@openmeteo/weather-map-layer';
import { toast } from 'svelte-sonner';

import {
	activeChart,
	applyPreset,
	pickPrimaryVariable,
	setPlainVariable,
	setSources
} from '$lib/stores/chart';
import { EPS_SIBLINGS, loadEpsMeta } from '$lib/stores/eps';
import { loading } from '$lib/stores/preferences';
import {
	inProgress as iP,
	latest as l,
	metaJson as mJ,
	modelRun as mR,
	time as t
} from '$lib/stores/time';
import { domain as d, selectedDomain } from '$lib/stores/variables';

import {
	firstPopularTarget,
	isStandaloneVariable
} from '$lib/components/selection/selection-utils';

import { BASE_URI, fmtModelRun } from './helpers';
import { formatISOWithoutTimezone } from './time-format';
import { findTimeStep } from './time-utils';
import { updateUrl } from './url';

/**
 * Load the domain's latest/in-progress run info. Returns false when the load
 * failed (an error toast has been shown) or when the domain changed while the
 * requests were in flight; callers must not continue to meta.json then.
 */
export const getInitialMetaData = async (): Promise<boolean> => {
	const domain = get(selectedDomain);

	try {
		const [latestRes, inProgressRes] = await Promise.all([
			fetch(`${BASE_URI}/${domain.value}/latest.json`),
			fetch(`${BASE_URI}/${domain.value}/in-progress.json`)
		]);

		// The domain may have changed while these requests were in flight (e.g. the
		// initial persisted-domain load racing a URL-driven domain change). Discard the
		// stale response so it can't clobber the current domain's metadata.
		if (get(d) !== domain.value) return false;

		for (const res of [latestRes, inProgressRes]) {
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
		}
		l.set(await latestRes.json());
		iP.set(await inProgressRes.json());
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

	if (!res.ok) {
		loading.set(false);
		throw new Error(`HTTP ${res.status}`);
	}

	return res.json();
};

export const getMetaData = async (): Promise<DomainMetaDataJson> => {
	const domain = get(d);

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
			: await fetchMetaData(domain, modelRun);

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
// metadata/time, and when a load failed (already surfaced as an error toast),
// so the map keeps running on whatever state it has.
export const loadDomainMetaData = async (newDomain: string) => {
	void loadEpsMeta(newDomain);
	if (!(await getInitialMetaData())) return;
	if (get(d) !== newDomain) return;
	const meta = await tryGetMetaData();
	if (!meta || get(d) !== newDomain) return;
	mJ.set(meta);

	const timeSteps = meta.valid_times.map((validTime: string) => new Date(validTime));
	const timeStep = findTimeStep(get(t), timeSteps) ?? timeSteps[0];
	t.set(timeStep);
	updateUrl('time', formatISOWithoutTimezone(timeStep));

	matchChartOrFallback();
};

/**
 * After a domain switch, keep only the chart sources the new domain actually
 * serves. When nothing survives, fall back to a plain chart via a
 * prefix-match on the primary variable (keeps the variable family, e.g.
 * temperature_2m → temperature_850hPa); when even that fails, to the first
 * popular entry the domain serves (typically temperature), else the first
 * plottable variable rather than an arbitrary one.
 */
export const matchChartOrFallback = () => {
	const metaJson = get(mJ);
	if (!metaJson) return;

	const chart = get(activeChart);
	// Cross-domain (EPS) sources survive when they still point at the new
	// domain's sibling; their variables are never in the main meta.json.
	const surviving = chart.sources.filter((source) =>
		source.domain
			? source.domain === EPS_SIBLINGS[get(d)]
			: metaJson.variables.includes(source.variable)
	);
	if (surviving.length === chart.sources.length) return;

	if (surviving.length > 0) {
		setSources(surviving);
		return;
	}

	const primary = pickPrimaryVariable(chart);
	const prefix = primary.match(VARIABLE_PREFIX)?.groups?.prefix;
	// Directions and v-components are useless as a standalone raster (and
	// "wind" would otherwise match wind_wave_direction on marine domains)
	const matched = prefix
		? metaJson.variables.find((mv) => mv.startsWith(prefix) && isStandaloneVariable(mv))
		: undefined;
	if (matched) {
		setPlainVariable(matched);
		return;
	}

	const popular = firstPopularTarget(metaJson.variables);
	if (popular?.presetId) {
		applyPreset(popular.presetId);
		return;
	}
	// e.g. cams greenhouse-gas domains serve no popular entry: pick the
	// first variable that works as a standalone raster (not a direction)
	const fallback = metaJson.variables.find(isStandaloneVariable);
	setPlainVariable(popular?.variable ?? fallback ?? metaJson.variables[0]);
};
