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
	/** Animated flow style: particle count on screen. */
	particleCount: number;
	/** Animated flow style: point/trail width in CSS px. */
	particleSize: number;
	/** Animated flow style: screen speed in px/s per m/s of wind. */
	particleSpeed: number;
	/** Animated flow style: trail persistence per 60fps frame (0..1). */
	particleTrail: number;
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
	{ beforeRead: (stored) => ({ ...defaultVectorOptions, ...stored }) }
);
