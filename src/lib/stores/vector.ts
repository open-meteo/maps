import { persisted } from 'svelte-persisted-store';

import { DEFAULT_VECTOR_OPTIONS } from '$lib/constants';

import type { ArrowRender, ArrowStyle } from '@openmeteo/weather-map-layer';

export const defaultVectorOptions = DEFAULT_VECTOR_OPTIONS;

/**
 * Wind rendering style: the WML icon alphabets (arrow/barb, drawn per point)
 * plus the animated GPU particle flow.
 */
export type WindStyle = ArrowStyle | 'particles';
export const VALID_WIND_STYLES: readonly WindStyle[] = ['arrow', 'barb', 'particles'];

export interface VectorOptions {
	grid: boolean;
	arrows: boolean;
	arrowStyle: WindStyle;
	arrowRender: ArrowRender;
	arrowIconScale: number;
	arrowPacking: number;
	contours: boolean;
	breakpoints: boolean;
	contourInterval: number;
	/** Animated flow style: particle count as a x-factor on the viewport-scaled baseline. */
	particleDensity: number;
	/** Animated flow style: point/trail width as a x-factor on the viewport-scaled baseline. */
	particleWidth: number;
	/** Animated flow style: screen speed in px/s per m/s of wind. */
	particleSpeed: number;
	/** Animated flow style: trail persistence per 60fps frame (0..1). */
	particleTrail: number;
	/** Animated flow style: trail opacity 0..1 (light theme scales it down). */
	particleOpacity: number;
}

/**
 * `beforeRead` fills in keys the stored object predates: a `vector-options`
 * written before a key existed (e.g. `arrows`) otherwise reads back as
 * `undefined` and silently disables the feature for anyone whose localStorage
 * survived the change.
 */
export const vectorOptions = persisted<VectorOptions, Partial<VectorOptions>>(
	'vector-options',
	defaultVectorOptions,
	{
		beforeRead: (stored) => {
			// The factor rework replaced the absolute particleCount/particleSize
			// with viewport-scaled x-factors; a stored object from before carries
			// values tuned against the old semantics, so drop its particle block
			// and start those from the new defaults.
			if ('particleCount' in stored) {
				const legacy = { ...stored } as Partial<VectorOptions> & Record<string, unknown>;
				delete legacy.particleCount;
				delete legacy.particleSize;
				delete legacy.particleSpeed;
				delete legacy.particleTrail;
				delete legacy.particleOpacity;
				stored = legacy;
			}
			return { ...defaultVectorOptions, ...stored };
		}
	}
);
