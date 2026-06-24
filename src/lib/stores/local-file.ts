import { writable } from 'svelte/store';

/**
 * State for a locally dropped `.om` file.
 *
 * When `localOmBase` is set the app renders that file (read straight from
 * memory by the protocol) instead of fetching tiles from the server, and the
 * domain/model-run/time machinery is bypassed.
 */

/** Synthetic protocol base url (`local/<uuid>`) of the active dropped file, or
 *  undefined when running in normal (server) mode. */
export const localOmBase = writable<string | undefined>(undefined);

/** Original filename of the dropped file, for display. */
export const localOmFilename = writable<string | undefined>(undefined);

/** Variables available in the dropped file, used to populate the selector. */
export const localOmVariables = writable<string[]>([]);
