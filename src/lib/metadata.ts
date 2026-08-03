import { get } from 'svelte/store';

import { type DomainMetaDataJson, VARIABLE_PREFIX } from '@openmeteo/weather-map-layer';

import {
	activeChart,
	applyPreset,
	pickPrimaryVariable,
	setPlainVariable,
	setSources
} from '$lib/stores/chart';
import { loading } from '$lib/stores/preferences';
import {
	inProgress as iP,
	latest as l,
	metaJson as mJ,
	modelRun as mR,
	time as t
} from '$lib/stores/time';
import { domain as d, selectedDomain } from '$lib/stores/variables';

import { firstPopularTarget } from '$lib/components/selection/selection-utils';

import { fmtModelRun, getBaseUri } from './helpers';
import { formatISOWithoutTimezone } from './time-format';
import { findTimeStep } from './time-utils';
import { updateUrl } from './url';

export const getInitialMetaData = async () => {
	const domain = get(selectedDomain);
	const uri = getBaseUri(domain.value);

	const [latestRes, inProgressRes] = await Promise.all([
		fetch(`${uri}/${domain.value}/latest.json`),
		fetch(`${uri}/${domain.value}/in-progress.json`)
	]);

	// The domain may have changed while these requests were in flight (e.g. the
	// initial persisted-domain load racing a URL-driven domain change). Discard the
	// stale response so it can't clobber the current domain's metadata.
	if (get(d) !== domain.value) return;

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
	const url = `${uri}/${domain}/${fmtModelRun(modelRun)}/meta.json`;
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

// Full metadata refresh for a domain: fetches the latest/in-progress run info
// and the run's meta.json, clamps the selected time to the valid times in the
// metadata (falling back to the first valid time), and re-matches the
// variable. Bails out if a newer domain change superseded this load while
// metadata was being fetched, so we don't commit another domain's
// metadata/time.
export const loadDomainMetaData = async (newDomain: string) => {
	await getInitialMetaData();
	if (get(d) !== newDomain) return;
	const meta = await getMetaData();
	if (get(d) !== newDomain) return;
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
 * popular entry the domain serves (temperature on weather domains, the waves
 * preset on marine domains) rather than an arbitrary variable.
 */
export const matchChartOrFallback = () => {
	const metaJson = get(mJ);
	if (!metaJson) return;

	const chart = get(activeChart);
	const surviving = chart.sources.filter((source) => metaJson.variables.includes(source.variable));
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
		? metaJson.variables.find(
				(mv) => mv.startsWith(prefix) && !mv.includes('_direction') && !mv.includes('v_component')
			)
		: undefined;
	if (matched) {
		setPlainVariable(matched);
		return;
	}

	const popular = firstPopularTarget(metaJson.variables);
	if (popular?.presetId) applyPreset(popular.presetId);
	else setPlainVariable(popular?.variable ?? metaJson.variables[0]);
};
