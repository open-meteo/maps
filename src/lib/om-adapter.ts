/**
 * Leaflet has no custom protocols and no vector tiles. The weather-map-layer
 * adapter turns `om://` URLs into GridLayers whose tiles are rendered by the
 * protocol: canvas tiles for rasters, and canvas-drawn MVT features for the
 * vector layers. The channel builders in om-layer-defs.ts consume it.
 */
import { get } from 'svelte/store';

import { addLeafletProtocolSupport, omProtocol } from '@openmeteo/weather-map-layer';
import L from 'leaflet';

import { omProtocolSettings } from '$lib/stores/om-protocol-settings';

export const omAdapter = addLeafletProtocolSupport(
	L as unknown as Parameters<typeof addLeafletProtocolSupport>[0]
);

/** Register the `om` protocol; the settings are read per request so runtime changes apply. */
export const registerOmProtocol = (): void => {
	// The adapter types the request loosely; the protocol only sees the
	// `image` / `arrayBuffer` / `json` requests the adapter issues
	omAdapter.addProtocol('om', (params, abortController) =>
		omProtocol(params as Parameters<typeof omProtocol>[0], abortController, get(omProtocolSettings))
	);
};
