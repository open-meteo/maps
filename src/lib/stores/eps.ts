/**
 * Ensemble (EPS) sibling support: while a deterministic model is selected,
 * its EPS counterpart's metadata is loaded in the background so ensemble-only
 * variables (currently `precipitation_probability`) can join the chart as
 * cross-domain sources.
 */
import { get, writable } from 'svelte/store';

import { getBaseUri } from '$lib/helpers';

import { domain } from './variables';

/** EPS sibling domain per deterministic domain. */
export const EPS_SIBLINGS: Record<string, string> = {
	dwd_icon: 'dwd_icon_eps',
	dwd_icon_eu: 'dwd_icon_eu_eps',
	dwd_icon_d2: 'dwd_icon_d2_eps',
	ncep_gfs025: 'ncep_gefs025',
	ncep_gfs013: 'ncep_gefs025'
};

export interface EpsMeta {
	/** The EPS domain, e.g. `dwd_icon_eps`. */
	domain: string;
	/** The EPS domain's own latest model run (its cycle can differ). */
	referenceTime: Date;
	/** Sorted valid steps; usually coarser than the main model's late steps. */
	validTimes: Date[];
	variables: string[];
}

/** Metadata of the active domain's EPS sibling; undefined when it has none. */
export const epsMeta = writable<EpsMeta | undefined>(undefined);

/**
 * Load the EPS sibling's latest.json for a freshly selected domain. Runs in
 * the background: the EPS popular row and any EPS chart source appear once
 * this resolves. Errors just leave EPS unavailable.
 */
export const loadEpsMeta = async (mainDomain: string): Promise<void> => {
	epsMeta.set(undefined);
	const sibling = EPS_SIBLINGS[mainDomain];
	if (!sibling) return;

	try {
		const res = await fetch(`${getBaseUri(sibling)}/${sibling}/latest.json`);
		if (!res.ok) return;
		const json = await res.json();
		// The domain may have changed while the request was in flight
		if (get(domain) !== mainDomain) return;
		const validTimes = ((json.valid_times ?? []) as string[])
			.map((validTime) => new Date(validTime))
			.sort((a, b) => a.getTime() - b.getTime());
		if (!json.reference_time || !validTimes.length) return;
		epsMeta.set({
			domain: sibling,
			referenceTime: new Date(json.reference_time),
			validTimes,
			variables: (json.variables ?? []) as string[]
		});
	} catch {
		// EPS stays unavailable for this domain
	}
};
