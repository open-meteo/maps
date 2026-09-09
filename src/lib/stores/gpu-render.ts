import { persisted } from 'svelte-persisted-store';

const defaults = {
	/**
	 * Morph timestep changes as an in-shader value blend. Off = every commit
	 * snaps directly once all layers of the batch are loaded.
	 */
	temporalBlend: true,
	/**
	 * Advect precipitation/cloud fields along the wind during the blend, so
	 * features drift with the flow instead of cross-fading in place.
	 */
	advectedBlend: true,
	/** Decorative falling-streak overlay on precipitation rasters. */
	rainAnimation: false
};

/** GPU rendering options from the settings pane. */
export const gpuRenderOptions = persisted<typeof defaults, Partial<typeof defaults>>(
	'gpu-render-options',
	defaults,
	// Fill in keys a stored object predates, like the vector-options store.
	{ beforeRead: (stored) => ({ ...defaults, ...stored }) }
);
