/**
 * Mapbox GL JS has no custom protocols. The weather-map-layer adapter turns
 * `om://` URLs into a custom raster source (tiles rendered by the protocol)
 * and a viewport-synced GeoJSON source for the vector layers; the channel
 * builders in om-layer-defs.ts consume it.
 */
import { get } from 'svelte/store';

import { addMapboxProtocolSupport, omProtocol } from '@openmeteo/weather-map-layer';

import { omProtocolSettings } from '$lib/stores/om-protocol-settings';

export const omAdapter = addMapboxProtocolSupport();

/** Register the `om` protocol; the settings are read per request so runtime changes apply. */
export const registerOmProtocol = (): void => {
	// The adapter types the request loosely; the protocol only sees the
	// `image` / `arrayBuffer` / `json` requests the adapter issues
	omAdapter.addProtocol('om', (params, abortController) =>
		omProtocol(params as Parameters<typeof omProtocol>[0], abortController, get(omProtocolSettings))
	);
};
