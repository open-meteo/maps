import { writable } from 'svelte/store';

// Sun cycle shadow overlay, driven purely by URL parameters (sun_shadow,
// sun_opacity, sun_gradient, sun_color). Undefined options fall back to the
// weather-map-layer sun protocol defaults.
export interface SunShadowState {
	shadow: boolean;
	opacity: number | undefined;
	gradient: number | undefined;
	color: string | undefined;
}

export const sunShadow = writable<SunShadowState>({
	shadow: false,
	opacity: undefined,
	gradient: undefined,
	color: undefined
});
