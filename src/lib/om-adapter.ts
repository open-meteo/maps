/**
 * OpenLayers has no custom protocols. The weather-map-layer adapter turns
 * `om://` URLs into a DataTile source (raster tiles rendered by the protocol,
 * for a WebGLTile layer) and an MVT VectorTile source (vector tiles decoded
 * by OpenLayers' own pipeline). The channel builders in om-layer-defs.ts
 * consume it.
 */
import { get } from 'svelte/store';

import { addOpenLayersProtocolSupport, omProtocol } from '@openmeteo/weather-map-layer';
import MVT from 'ol/format/MVT';
import DataTile from 'ol/source/DataTile';
import VectorTile from 'ol/source/VectorTile';

import { omProtocolSettings } from '$lib/stores/om-protocol-settings';

export const omAdapter = addOpenLayersProtocolSupport({
	source: { DataTile, VectorTile },
	format: { MVT }
} as unknown as Parameters<typeof addOpenLayersProtocolSupport>[0]);

/** Register the `om` protocol; the settings are read per request so runtime changes apply. */
export const registerOmProtocol = (): void => {
	// The adapter types the request loosely; the protocol only sees the
	// `image` / `arrayBuffer` / `json` requests the adapter issues
	omAdapter.addProtocol('om', (params, abortController) =>
		omProtocol(params as Parameters<typeof omProtocol>[0], abortController, get(omProtocolSettings))
	);
};
