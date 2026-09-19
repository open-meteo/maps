import { get } from 'svelte/store';

import {
	getProtocolInstance,
	registerLocalOmFile,
	unregisterLocalOmFile
} from '@openmeteo/weather-map-layer';
import { toast } from 'svelte-sonner';

import {
	localOmBase,
	localOmFilename,
	localOmVariables,
	recentLocalFiles
} from '$lib/stores/local-file';
import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
import { loading } from '$lib/stores/preferences';
import { time } from '$lib/stores/time';
import { variable } from '$lib/stores/variables';

import { changeOMfileURL } from './layers';
import { formatISOWithoutTimezone, parseISOWithoutTimezone } from './time-format';
import { updateUrl } from './url';

/** How many dropped files to remember (older ones are evicted + unregistered). */
const MAX_RECENT_LOCAL_FILES = 6;

/** Best-effort: derive the timestep from the filename (YYYY-MM-DDTHHMM.om). */
const applyFilenameTime = (filename: string): void => {
	const match = filename.match(/(\d{4}-\d{2}-\d{2}T\d{2}\d{2})/);
	if (!match) return;
	try {
		const parsed = parseISOWithoutTimezone(match[1]);
		time.set(parsed);
		updateUrl('time', formatISOWithoutTimezone(parsed));
	} catch {
		// Unparseable filename – keep the current time.
	}
};

/** Add/raise a file in the recents list (deduped by filename), evicting + freeing the overflow. */
const rememberRecent = (base: string, filename: string): void => {
	recentLocalFiles.update((list) => {
		// Drop any prior entry for the same filename (it points at a stale base).
		for (const entry of list) {
			if (entry.filename === filename && entry.base !== base) {
				unregisterLocalOmFile(entry.base);
			}
		}
		const next = [{ base, filename }, ...list.filter((e) => e.filename !== filename)];
		for (const evicted of next.slice(MAX_RECENT_LOCAL_FILES)) {
			unregisterLocalOmFile(evicted.base);
		}
		return next.slice(0, MAX_RECENT_LOCAL_FILES);
	});
};

/** Read the file's variables and switch the map into local mode for it. */
const activate = async (base: string, filename: string): Promise<boolean> => {
	const reader = getProtocolInstance(get(omProtocolSettings)).omFileReader;
	await reader.setToOmFile(base);
	const variables = await reader.listVariables();

	if (variables.length === 0) {
		toast.error(`No readable variables found in ${filename}`);
		return false;
	}

	localOmFilename.set(filename);
	localOmVariables.set(variables);
	localOmBase.set(base);

	applyFilenameTime(filename);

	// Keep the current variable if the file has it, otherwise use the first.
	const current = get(variable);
	variable.set(variables.includes(current) ? current : variables[0]);

	changeOMfileURL();
	return true;
};

/** Register a freshly dropped `.om` file and render it. */
export const loadLocalOmFile = async (file: File): Promise<void> => {
	try {
		loading.set(true);
		const base = registerLocalOmFile(file);
		const ok = await activate(base, file.name);
		if (!ok) {
			loading.set(false);
			return;
		}
		rememberRecent(base, file.name);
		toast.success(`Loaded ${file.name}`);
	} catch (e) {
		loading.set(false);
		toast.error(`Failed to load ${file.name}: ${(e as Error).message}`);
	}
};

/** Re-load a previously dropped file that is still held in memory. */
export const activateLocalOmFile = async (base: string, filename: string): Promise<void> => {
	try {
		loading.set(true);
		const ok = await activate(base, filename);
		if (!ok) {
			loading.set(false);
			return;
		}
		rememberRecent(base, filename); // raise to the top
	} catch (e) {
		loading.set(false);
		toast.error(`Failed to load ${filename}: ${(e as Error).message}`);
	}
};
