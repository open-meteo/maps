import { persisted } from 'svelte-persisted-store';

/** GPU rendering options from the settings pane. */
export const gpuRenderOptions = persisted('gpu-render-options', {
	/**
	 * Morph timestep changes as an in-shader value blend. Off = every commit
	 * snaps directly once all layers of the batch are loaded.
	 */
	temporalBlend: true
});
