import { get, writable } from 'svelte/store';

import {
	type DomainMetaDataJson,
	registerLocalOmFile,
	unregisterLocalOmFile
} from '@openmeteo/weather-map-layer';
import { toast } from 'svelte-sonner';

import { changeOMfileURL } from '$lib/layers';
import { loadDomainMetaData, matchChartOrFallback } from '$lib/metadata';
import { formatISOWithoutTimezone, parseISOWithoutTimezone } from '$lib/time-format';
import { updateUrl } from '$lib/url';

import { metaJson, modelRun, modelRunLocked, time } from './time';
import { domain } from './variables';

export interface LocalOmFile {
	/** Registry url the om protocol serves the file under (`local/<id>`). */
	baseUrl: string;
	name: string;
}

/**
 * The dropped `.om` file shown instead of the domain's server data, if any.
 * It stands in for the domain through a synthetic single-step meta.json, so
 * the time track, model-run selector and variable list need no special
 * casing; only the om URL differs. Local mode lasts exactly as long as that
 * synthetic entry is the active metadata: loading any server metadata (a
 * domain or model-run switch) leaves it.
 */
export const localOmFile = writable<LocalOmFile | undefined>(undefined);

let localMeta: DomainMetaDataJson | undefined;
metaJson.subscribe((meta) => {
	if (localMeta && meta !== localMeta) {
		localMeta = undefined;
		localOmFile.set(undefined);
	}
});

/** Timestep of a data_spatial filename (`2026-09-21T0600.om`), if it has one. */
const timeFromFilename = (name: string): Date | undefined => {
	const match = name.match(/\d{4}-\d{2}-\d{2}T\d{4}/);
	return match ? parseISOWithoutTimezone(match[0]) : undefined;
};

export const loadLocalOmFile = async (file: File): Promise<void> => {
	try {
		const entry = await registerLocalOmFile(file);
		if (!entry.variables.length) {
			unregisterLocalOmFile(entry.baseUrl);
			toast.error(`${file.name} holds no 2D variables`);
			return;
		}
		// Frames of the previous file may still be resident, but never get
		// re-read; the registry only needs the file being shown
		const previous = get(localOmFile);
		if (previous) unregisterLocalOmFile(previous.baseUrl);

		const step = timeFromFilename(file.name) ?? get(time);
		const iso = step.toISOString();
		localMeta = {
			completed: true,
			last_modified_time: iso,
			reference_time: iso,
			valid_times: [iso],
			variables: entry.variables
		};
		localOmFile.set({ baseUrl: entry.baseUrl, name: file.name });
		// The file is its own model run; locked, so the time track cannot
		// wander off its single step onto the server
		modelRun.set(step);
		modelRunLocked.set(true);
		time.set(step);
		updateUrl('time', formatISOWithoutTimezone(step));
		metaJson.set(localMeta);
		matchChartOrFallback();
		changeOMfileURL();
		toast.success(`Loaded ${file.name}`);
	} catch (e) {
		toast.error(`Could not load ${file.name}: ${(e as Error).message}`);
	}
};

/** Back to the server data of the current domain. */
export const leaveLocalOmFile = async (): Promise<void> => {
	// The file's run is no server run; the reload has to pick its own
	modelRun.set(undefined);
	modelRunLocked.set(false);
	await loadDomainMetaData(get(domain));
	changeOMfileURL();
};
