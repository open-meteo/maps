/**
 * Chart layer orchestration: turns the active chart's sources into a render
 * state and shows it as one synchronized frame. With the GPU renderer the
 * rasters, plain arrows, the animated flow and contour lines render through
 * persistent tile-free `WeatherGpuLayer`s (GpuRasterManager), where a
 * timestep change blends the data values in-shader; contour labels, barbs and
 * grid points stay on the CPU tile pipeline via the FrameManager. With the
 * CPU renderer every channel is a tile layer of the FrameManager. Data is
 * shared per variable inside the om protocol state, so a raster layer and a
 * vector channel of the same source trigger a single fetch.
 */
import { get } from 'svelte/store';

import {
	getDataState,
	getDomainBoundary,
	isSeamlessDomain,
	selectSeamlessLayers,
	variableSupportsBarbs
} from '@openmeteo/weather-map-layer';
import * as maplibregl from 'maplibre-gl';
import { mode } from 'mode-watcher';
import { toast } from 'svelte-sonner';

import { chartSources } from '#lib/stores/chart.js';
import { gpuRenderOptions } from '#lib/stores/gpu-render.js';
import { map as m } from '#lib/stores/map.js';
import { type Renderer, renderer } from '#lib/stores/preferences.js';
import { loading, opacity, preferences as p } from '#lib/stores/preferences.js';
import { modelRun, time } from '#lib/stores/time.js';
import { selectedDomain, variable as variableStore } from '#lib/stores/variables.js';
import {
	type VectorOptions,
	defaultVectorOptions,
	vectorOptions as vO
} from '#lib/stores/vector.js';

import { windIconSizePx, windIconSpacing } from '#lib/arrow-sprites.js';
import { sourceKey } from '#lib/chart-encoding.js';
import { defaultArrowStyle, defaultContourStyle } from '#lib/chart-styles.js';
import { alphaOfCssColor } from '#lib/color.js';
import { createCommitBarrier } from '#lib/commit-barrier.js';
import {
	BEFORE_LAYER_RASTER,
	BEFORE_LAYER_VECTOR,
	BEFORE_LAYER_VECTOR_WATER_CLIP,
	CROSS_FADE_MS,
	HILLSHADE_LAYER,
	PARTICLE_BASE_COUNT,
	PARTICLE_BASE_WIDTH_PX,
	PARTICLE_REF_AREA
} from '#lib/constants.js';
import { type FrameChannel, FrameManager } from '#lib/frame-manager.js';
import { GpuRasterManager, type GpuRasterSlotSpec } from '#lib/gpu-raster-manager.js';
import { rasterChannel, vectorChannel } from '#lib/om-layer-defs.js';
import { isPrefetched } from '#lib/prefetch.js';

import { refreshPopup } from './popup';
import { gpuCacheMb, omProtocolSettings } from './stores/om-protocol-settings';
import { getOmUrlForSource } from './url';

import type {
	ClippingOptions,
	GpuAdvectionSource,
	GpuArrowConfig,
	GpuContourStyle,
	GpuParticleConfig
} from '@openmeteo/weather-map-layer';

let frameManager: FrameManager | undefined;
let gpuRasters: GpuRasterManager | undefined;
/** Renderer of the last shown render state: a change cross-dissolves the paths. */
let shownRenderer: Renderer | undefined;

// Combined loading indicator: GPU raster loads and vector tile frames finish
// independently; the spinner shows while either is pending.
let vectorLoading = false;
let rasterLoading = false;
const updateLoading = (): void => loading.set(vectorLoading || rasterLoading);

const getRasterOpacity = (): number => {
	const opacityValue = get(opacity) / 100;
	return mode.current === 'dark' ? Math.max(0, (opacityValue * 100 - 10) / 100) : opacityValue;
};

interface RenderState {
	rasters: GpuRasterSlotSpec[];
	vectors: FrameChannel[];
}

/** Build the render state for the current chart, or undefined while not ready. */
const buildRenderState = (): RenderState | undefined => {
	const sources = get(chartSources);
	const preferences = get(p);
	const vectorOptions = get(vO);
	const dark = mode.current === 'dark';
	const rasterBefore = preferences.hillshade ? HILLSHADE_LAYER : BEFORE_LAYER_RASTER;
	const vectorBefore = preferences.clipWater ? BEFORE_LAYER_VECTOR_WATER_CLIP : BEFORE_LAYER_VECTOR;

	const gpuRender = get(gpuRenderOptions);
	// CPU rendering: every channel goes through the tile pipeline; no GPU slot
	// is created at all.
	const cpu = get(renderer) === 'cpu';
	const rasters: GpuRasterSlotSpec[] = [];
	const vectors: FrameChannel[] = [];
	for (const source of sources) {
		const omUrl = getOmUrlForSource(source);
		// A cross-domain (EPS) source is skipped rather than fatal while its
		// sibling metadata loads; the epsMeta subscription re-renders then.
		if (!omUrl) {
			if (source.domain) continue;
			return undefined;
		}
		const url = 'om://' + omUrl;

		// Plain-style arrows render as instanced overlays of the GPU layer (they
		// morph with the raster blend and follow the globe); the animated wind
		// style renders as the GPU particle pass; barbs keep the CPU tile
		// pipeline for their discrete glyph alphabet.
		const gpuArrows = !cpu && !!source.arrows && vectorOptions.arrowStyle === 'arrow';
		const gpuParticles = !cpu && !!source.arrows && vectorOptions.arrowStyle === 'particles';
		const cpuArrows = !!source.arrows && !gpuArrows && !gpuParticles;

		if (source.raster && cpu) {
			vectors.push(
				rasterChannel(
					sourceKey(source),
					url,
					getRasterOpacity() * (source.opacity ?? 1),
					rasterBefore
				)
			);
		} else if (source.raster) {
			rasters.push({
				key: sourceKey(source),
				url,
				opacity: getRasterOpacity() * (source.opacity ?? 1),
				beforeLayer: rasterBefore,
				raster: true,
				// Precipitation/cloud blends advect along the wind (radar-like
				// motion); domains without any candidate fall back silently.
				advectWind:
					gpuRender.advectedBlend && ADVECTED_VARIABLES.test(source.variable)
						? ADVECT_STEERING_WINDS
						: undefined
			});
		}
		if (gpuArrows) {
			rasters.push({
				key: `${sourceKey(source)}:arrows`,
				url,
				opacity: source.opacity ?? 1,
				// Arrows sit with the other vector overlays above the raster stack,
				// unless the source inlines its vectors into the raster stack
				beforeLayer: source.inlineVectors ? rasterBefore : vectorBefore,
				raster: false,
				arrows: gpuArrowConfig(vectorOptions.arrowIconScale, dark)
			});
		}
		if (gpuParticles) {
			rasters.push({
				key: `${sourceKey(source)}:particles`,
				url,
				opacity: source.opacity ?? 1,
				beforeLayer: source.inlineVectors ? rasterBefore : vectorBefore,
				raster: false,
				particles: gpuParticleConfig(vectorOptions, dark, source.variable)
			});
		}
		if (!cpu && gpuRender.rainAnimation && source.raster && RAIN_VARIABLES.test(source.variable)) {
			rasters.push({
				key: `${sourceKey(source)}:rain`,
				url,
				opacity: source.opacity ?? 1,
				beforeLayer: source.inlineVectors ? rasterBefore : vectorBefore,
				raster: false,
				particles: rainParticleConfig(dark)
			});
		}
		// Contour lines render in-shader (they morph with the temporal blend and
		// have no tile seams); the CPU channel below only contributes the labels.
		if (source.contours && !cpu) {
			rasters.push({
				key: `${sourceKey(source)}:contours`,
				url,
				opacity: source.opacity ?? 1,
				beforeLayer: source.inlineVectors ? rasterBefore : vectorBefore,
				raster: false,
				contours: gpuContourStyle(source.lineWidth, dark)
			});
		}
		if (source.contours || cpuArrows || vectorOptions.grid) {
			vectors.push(
				vectorChannel(sourceKey(source), url, {
					contours: !!source.contours,
					contourLines: cpu,
					arrows: cpuArrows,
					// The particle style never reaches the CPU channel; keep its
					// arrowStyle a valid icon alphabet. Barbs encode knots, so
					// sources whose directions come with another quantity (waves,
					// currents) stay on arrows under the barb setting.
					arrowStyle:
						vectorOptions.arrowStyle === 'barb' && variableSupportsBarbs(source.variable)
							? 'barb'
							: 'arrow',
					arrowRender: vectorOptions.arrowRender,
					arrowIconScale: vectorOptions.arrowIconScale,
					grid: vectorOptions.grid,
					dark,
					// Inline vectors join the raster stack right above their own
					// raster, so rasters of later sources overlap them
					beforeLayer: source.inlineVectors ? rasterBefore : vectorBefore,
					inline: !!source.inlineVectors,
					lineWidth: source.lineWidth
				})
			);
		}
	}
	return { rasters, vectors };
};

/**
 * The GPU arrow pass, based on the CPU icon renderer's lattice but calmer:
 * wider spacing and lighter strokes — the per-pixel raster already carries the
 * magnitude, the arrows only need to show flow.
 */
const GPU_ARROW_SPACING = 1.5;
const GPU_ARROW_WEIGHT = 0.7;

/** The GPU isoline pass styled like the CPU contour line layer would be. */
const gpuContourStyle = (lineWidth: number | undefined, dark: boolean): GpuContourStyle => {
	const levels = defaultContourStyle.levels;
	const width = lineWidth ?? 1;
	return {
		color: dark ? [1, 1, 1] : [0, 0, 0],
		classAlphas: levels.map((level) =>
			alphaOfCssColor(dark ? level.darkColor : level.lightColor)
		) as [number, number, number, number],
		classWidths: levels.map((level) => level.width * width) as [number, number, number, number],
		moduli: levels.slice(1).map((level) => level.modulo) as [number, number, number]
	};
};

/** Raster variables whose temporal blend advects along the wind. */
const ADVECTED_VARIABLES =
	/^(precipitation|rain|showers|snowfall|cloud_cover|cloud_base|cloud_top)/;

/**
 * Steering winds for the advected blend, tried in order. Precipitation cells
 * move with the mid-tropospheric flow, not the surface wind — advecting with
 * the 10 m wind under-shoots the true motion, and the misaligned blend copies
 * made the high-value cores see-saw while the envelope translated smoothly.
 * 700 hPa is the classic steering level; where a domain lacks it, the 10 m
 * wind with an empirical ~1.7x steering factor approximates it.
 */
const ADVECT_STEERING_WINDS: GpuAdvectionSource[] = [
	{ variable: 'wind_u_component_700hPa' },
	{ variable: 'wind_u_component_10m', speedFactor: 1.7 }
];
/** Raster variables that can carry the decorative rain-streak overlay. */
const RAIN_VARIABLES = /^(precipitation|rain|showers)/;

/**
 * Viewport scale for the particle presentation: the count and stroke width
 * were tuned on a large 4K viewport, and the same absolute values overwhelm a
 * phone. s = cbrt(viewportArea / refArea); the count scales by s and the
 * width by √s — one cube-root law that reproduces both tuned references
 * (desktop ×1 → 20k @ 2.5px, a typical phone s ≈ 0.4 → 8k @ ~1.6px). Clamped
 * so extreme viewports (video walls, tiny embeds) stay sane.
 */
export const particleViewportScale = (viewport?: { width: number; height: number }): number => {
	const width = viewport?.width ?? (typeof window === 'undefined' ? 0 : window.innerWidth);
	const height = viewport?.height ?? (typeof window === 'undefined' ? 0 : window.innerHeight);
	if (!width || !height) return 1;
	return Math.min(1.25, Math.max(0.3, Math.cbrt((width * height) / PARTICLE_REF_AREA)));
};

/**
 * Particle count at the current viewport for a density factor. The settings
 * pane passes its reactively bound window size so its labels follow a resize.
 */
export const particleCountFor = (
	density: number,
	viewport?: { width: number; height: number }
): number => Math.round(PARTICLE_BASE_COUNT * density * particleViewportScale(viewport));

/** Stroke width in CSS px at the current viewport for a width factor. */
export const particleWidthFor = (
	width: number,
	viewport?: { width: number; height: number }
): number => PARTICLE_BASE_WIDTH_PX * width * Math.sqrt(particleViewportScale(viewport));

/**
 * The animated flow: a veil of particles whose fading trails trace the
 * streamlines. Like the arrows, the particles only show the flow — the raster
 * underneath carries the magnitude — so they stay thin and translucent.
 * Density, size, speed and trail length come from the settings pane (density
 * and width as factors on the viewport-scaled baseline); the variable family
 * adapts the presentation (waves march as slow dashes, ocean currents get
 * amplified speed and long trails).
 */
const gpuParticleConfig = (
	options: VectorOptions,
	dark: boolean,
	variable: string
): GpuParticleConfig => {
	const base: GpuParticleConfig = {
		count: particleCountFor(options.particleDensity),
		sizePx: particleWidthFor(options.particleWidth),
		color: dark ? [1, 1, 1] : [0, 0, 0],
		// Black strokes on the light basemap read heavier than white on dark;
		// scale the configured opacity down there so both themes match visually.
		opacity: options.particleOpacity * (dark ? 1 : 0.7),
		speedPxPerSec: options.particleSpeed,
		// Zoomed in, the zoom-invariant screen speed reads as a near standstill
		// against the fine map detail: gain speed per level above zoom 8.
		zoomSpeedGain: 0.25,
		fadeOpacity: options.particleTrail,
		maxAgeSec: 6,
		// Thin the population where the field is near-static (calm highs,
		// sheltered seas): idle particles are clutter, not information.
		calmThreshold: 0.8,
		calmThinning: 3
	};
	if (/wave/.test(variable)) {
		// Magnitude is the wave height (m), not a speed: scale it up so a 2 m
		// swell still marches visibly, and draw crest-oriented dashes.
		return {
			...base,
			shape: 'dash',
			dashLengthPx: 10,
			speedPxPerSec: options.particleSpeed * 2,
			fadeOpacity: Math.min(options.particleTrail, 0.94),
			maxAgeSec: 8,
			calmThreshold: 0.5,
			calmThinning: 4
		};
	}
	if (/current/.test(variable)) {
		// ~0.5 m/s flows: amplify and let long trails accumulate the gyres.
		return {
			...base,
			speedPxPerSec: options.particleSpeed * 15,
			fadeOpacity: 0.985,
			maxAgeSec: 12,
			calmThreshold: 0.04
		};
	}
	return base;
};

/** Rain streaks: falling dashes whose alpha follows the precipitation field.
 *  Scaled by the same viewport law as the flow particles. */
const rainParticleConfig = (dark: boolean): GpuParticleConfig => ({
	count: Math.round(4000 * particleViewportScale()),
	mode: 'rain',
	shape: 'dash',
	sizePx: 1.1 * Math.sqrt(particleViewportScale()),
	dashLengthPx: 11 * Math.sqrt(particleViewportScale()),
	speedPxPerSec: 130,
	maxAgeSec: 0.9,
	fadeOpacity: 0.35,
	rainRefValue: 1.5,
	minZoom: 4,
	color: dark ? [0.75, 0.85, 1] : [0.25, 0.35, 0.55],
	opacity: 0.7
});

const gpuArrowConfig = (scale: number, dark: boolean): GpuArrowConfig => ({
	spacingPx: windIconSpacing('arrow', scale, defaultVectorOptions.arrowPacking) * GPU_ARROW_SPACING,
	sizePx: windIconSizePx('arrow', scale),
	// No zoom gate: the lattice spacing follows the fractional zoom, so the
	// arrow count per screen is the same at every zoom level and world views
	// read as calm as any other zoom.
	color: dark ? [1, 1, 1] : [0, 0, 0],
	levels: defaultArrowStyle.levels.map((level) => ({
		minSpeed: level.minSpeed,
		alpha: alphaOfCssColor(dark ? level.darkColor : level.lightColor),
		width: level.width * GPU_ARROW_WEIGHT
	}))
});

// The particle config derives from the viewport size; after a resize (phone
// rotation, window drag) re-show so the count/width follow. changeOMfileURL
// diffs, so this is a cheap uniform/config update, not a data reload.
let resizeHandlerAttached = false;
let resizeDebounce: ReturnType<typeof setTimeout> | undefined;

/**
 * (Re)initialize the frame and GPU raster managers. Called on map load and
 * after every basemap style reload (which wipes all sources/layers).
 */
export const addOmFileLayers = (): void => {
	const map = get(m);
	if (!map) return;

	if (!resizeHandlerAttached) {
		resizeHandlerAttached = true;
		map.on('resize', () => {
			clearTimeout(resizeDebounce);
			resizeDebounce = setTimeout(() => changeOMfileURL(), 250);
		});
	}

	frameManager?.destroy();
	frameManager = new FrameManager(map, {
		crossFadeMs: CROSS_FADE_MS,
		retainMax: 3,
		getChannelDataState: getDataState,
		onLoadingChange: (isLoading) => {
			vectorLoading = isLoading;
			updateLoading();
		},
		onCommit: () => refreshPopup(),
		// Without this a failed frame is silent and just keeps the previous one
		// — on a first load that is an empty map with no hint
		onError: () =>
			toast.error('Could not load the weather data for this view.', { id: 'om-data-error' }),
		slowLoadWarningMs: 10000,
		onSlowLoad: () =>
			toast.warning('Loading data might be limited by bandwidth or upstream server speed.')
	});

	gpuRasters?.destroy();
	gpuRasters = new GpuRasterManager(map, {
		settings: get(omProtocolSettings),
		textureCacheMb: get(gpuCacheMb),
		onLoadingChange: (isLoading) => {
			rasterLoading = isLoading;
			updateLoading();
		},
		onShown: () => refreshPopup(),
		onError: () =>
			toast.error('Could not load the weather data for this view.', { id: 'om-data-error' })
	});
	applyFadeMs();
	changeOMfileURL();

	// (Re)creating the map layers (initial load or style reload) drops the
	// border layers, so force them to be drawn again.
	resetSeamlessBorderLayer();
	updateSeamlessBorderLayer();
};

/**
 * Move all resident raster stacks (and inline vectors, which share the
 * anchor) to the insertion point matching the current hillshade preference.
 * Called by the hillshade toggle, which changes the basemap stack without a
 * style reload.
 */
export const reanchorRasterLayers = (): void => {
	const hillshade = get(p).hillshade;
	const [from, to] = hillshade
		? [BEFORE_LAYER_RASTER, HILLSHADE_LAYER]
		: [HILLSHADE_LAYER, BEFORE_LAYER_RASTER];
	gpuRasters?.reanchor(from, to);
	// Inline vector channels share the raster anchor
	frameManager?.reanchor(from, to);
};

/**
 * Re-render the active chart. The frame manager deduplicates unchanged
 * render states, so this is safe to call on every store change.
 */
export const changeOMfileURL = (): void => {
	const map = get(m);
	if (!map || !frameManager || !gpuRasters) return;

	// `undefined` means a source is not ready yet; an empty state means the
	// chart deliberately draws nothing, which removes the GPU layers and
	// commits an empty vector frame
	const renderState = buildRenderState();
	if (!renderState) return;

	// Both managers load independently but commit through one barrier, so every
	// layer of the new render state starts animating in the same frame.
	// The GPU layers parse URLs against the settings object, which the store
	// replaces on changes (clipping, colour scales) — hand them the live one.
	gpuRasters.updateSettings(get(omProtocolSettings));
	const barrier = createCommitBarrier(2);
	// A GPU/CPU switch moves the rasters between the two paths: the GPU side
	// fades in or out at the barrier's commit, opposite the tile frame's own
	// cross-fade, like a variable switch within one path.
	const currentRenderer = get(renderer);
	const crossfade = shownRenderer !== undefined && shownRenderer !== currentRenderer;
	shownRenderer = currentRenderer;
	const transition = gpuRasters.show(renderState.rasters, barrier, { crossfade });
	frameManager.show(renderState.vectors, barrier, transition);
	updateSeamlessBorderLayer();
};

/** Preview masks rasterise/upload at quarter cost; the finish reload rebuilds at full quality. */
const PREVIEW_MASK_MAX_PX = 1024;

/**
 * Live clipping restyle: applies new clip polygons to the GPU layers already
 * on screen without reloading data — cheap enough to follow every terra-draw
 * change event while a polygon is drawn or dragged. The finishing edit goes
 * through the settings store + changeOMfileURL so the data crop catches up.
 */
export const previewClippingOptions = (options: ClippingOptions): void => {
	gpuRasters?.setClipping(options, PREVIEW_MASK_MAX_PX);
};

/** VRAM used/budgeted by the GPU weather layers (for the settings pane). */
export const getGpuMemoryUsage = (): { bytes: number; budgetBytes: number; textures: number } =>
	gpuRasters?.getMemoryUsage() ?? { bytes: 0, budgetBytes: 0, textures: 0 };

/**
 * Set the GPU layers' temporal blend duration, which the vector frame's
 * cross-fade follows. The animate loop matches it to its frame interval for
 * one continuous morph; pass undefined to restore the default scrub blend. With temporal animation disabled in the settings, every commit snaps
 * instead, whatever duration was requested.
 */
let requestedFadeMs = CROSS_FADE_MS;
export const setRasterFadeMs = (fadeMs?: number): void => {
	requestedFadeMs = fadeMs ?? CROSS_FADE_MS;
	applyFadeMs();
};
const applyFadeMs = (): void => {
	const fadeMs = get(gpuRenderOptions).temporalBlend ? requestedFadeMs : 0;
	gpuRasters?.setFadeMs(fadeMs);
	// Deliberately one clock for every layer of a render state: on a timestep
	// change, contours, arrows and grid points in the vector frame dissolve
	// over the same duration the GPU rasters morph, whether scrubbing,
	// animating or snapping.
	frameManager?.setDissolveMs(fadeMs);
};
gpuRenderOptions.subscribe(() => applyFadeMs());

/**
 * Cache residency of the primary source per timestep: 'vram' = texture on the
 * GPU, 'ram' = decoded in the protocol state or prefetched into the block
 * cache (near-instant to show), 'none' = would need a network fetch.
 */
export const getTimestepResidency = (times: Date[]): ('none' | 'ram' | 'vram')[] => {
	const base = gpuRasters?.getTimestepResidency(times) ?? times.map(() => 'none');
	const run = get(modelRun);
	const domainValue = get(selectedDomain)?.value;
	const variableValue = get(variableStore);
	if (!run || !domainValue || !variableValue) return base;
	return base.map((state, i) =>
		state === 'none' && isPrefetched(domainValue, variableValue, run, times[i]) ? 'ram' : state
	);
};

export const getActiveOmUrls = (): Map<string, string> => {
	// GPU raster slots are keyed by the source key directly
	const urls = gpuRasters?.getActiveUrls() ?? new Map<string, string>();
	for (const channel of frameManager?.getActiveChannels() ?? []) {
		// Channel keys are `${sourceKey}:kind:...`; source keys contain no colon
		const key = channel.key.slice(0, channel.key.indexOf(':'));
		if (!urls.has(key)) urls.set(key, channel.url);
	}
	return urls;
};

// =============================================================================
// Seamless domain border overlay
// =============================================================================

const SEAMLESS_BORDER_SOURCE_ID = 'seamlessBorderSource';

const isDark = (): boolean => mode.current === 'dark';

const removeSeamlessBorderLayer = (): void => {
	const map = get(m);
	if (!map) return;
	// Collect IDs first to avoid mutating the layer list while iterating
	const toRemove = (map.getStyle()?.layers ?? [])
		.map((l) => l.id)
		.filter((id) => id.startsWith('seamless-border-'));
	for (const id of toRemove) {
		if (map.getLayer(id)) map.removeLayer(id);
	}
	if (map.getSource(SEAMLESS_BORDER_SOURCE_ID)) map.removeSource(SEAMLESS_BORDER_SOURCE_ID);
};

// Tracks what the borders were last drawn for, so repeated calls (e.g. on every
// timestep change via changeOMfileURL) don't needlessly remove + re-add the
// layers — which restarts their fade-in transition and makes them flash.
let lastBorderSignature: string | null = null;

/** Forces the next updateSeamlessBorderLayer() to redraw (e.g. after a style reload). */
export const resetSeamlessBorderLayer = (): void => {
	lastBorderSignature = null;
};

export const updateSeamlessBorderLayer = (): void => {
	const map = get(m);
	if (!map) return;

	const preferences = get(p);
	const domain = get(selectedDomain);
	const draw = preferences.showSeamlessBorders && isSeamlessDomain(domain);

	// Only sub-domains the protocol would load at the selected time get a
	// border: past its forecast horizon a regional model drops out of the
	// composite, so its border must disappear too. The base layer (the last
	// one) covers the composite's whole extent and needs none.
	const modelRunDate = get(modelRun);
	const validTime = get(time);
	const leadTimeHours =
		modelRunDate && validTime
			? (validTime.getTime() - modelRunDate.getTime()) / 3_600_000
			: undefined;
	const regionalLayers =
		draw && isSeamlessDomain(domain)
			? selectSeamlessLayers(domain, get(omProtocolSettings).domainOptions, {
					leadTimeHours
				}).filter(({ layer }) => layer !== domain.layers[domain.layers.length - 1])
			: [];

	// Borders depend on the domain, the theme (colours), the toggle and which
	// sub-domains are available. Skip the flashing remove/re-add when none of
	// those changed (most timestep changes keep the same availability).
	const signature = draw
		? `${domain.value}|${isDark()}|${regionalLayers.map((l) => l.domain.value).join(',')}`
		: 'none';
	if (signature === lastBorderSignature) return;
	lastBorderSignature = signature;

	removeSeamlessBorderLayer();
	if (regionalLayers.length === 0) return;

	// Follow each domain's true outline: a precomputed data-shape footprint for
	// NULL-padded reprojected grids, otherwise a curved perimeter for projected
	// grids / the bounds rectangle for plain regular grids.
	//
	// Drawn as a LineString rather than a Polygon: the ring already closes on
	// itself, and a polygon's implicit ring-closing segment would jump ~360°
	// across the map for boundaries that cross the antimeridian or encircle a
	// pole (the perimeter's longitudes are continuous but may exceed ±180°).
	const features: GeoJSON.Feature<GeoJSON.LineString>[] = regionalLayers.map(
		({ layer, domain: concreteDomain }, i) => ({
			type: 'Feature',
			geometry: { type: 'LineString', coordinates: getDomainBoundary(concreteDomain) },
			properties: {
				layerIndex: i,
				minZoom: layer.minZoom,
				label: concreteDomain.label ?? concreteDomain.value
			}
		})
	);

	map.addSource(SEAMLESS_BORDER_SOURCE_ID, {
		type: 'geojson',
		data: { type: 'FeatureCollection', features }
	});

	// One line + one symbol MapLibre layer per boundary, each with its own
	// zoom-dependent opacity and colour keyed to that sub-domain's minZoom.
	const lineColor = isDark() ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)';
	const textColor = isDark() ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.75)';
	const textHalo = isDark() ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
	// Highlight colour once the sub-domain is active
	const activeLineColor = 'rgba(30,120,255,0.8)';
	const activeTextColor = 'rgba(30,120,255,1)';

	for (const feature of features) {
		const i = feature.properties!.layerIndex as number;
		const minZoom = feature.properties!.minZoom as number;
		// Tiles of zoom `minZoom` are shown from map zoom minZoom - 0.5, so that
		// is where the sub-domain takes over; the border fades in over the 2.5
		// zoom levels before it, announcing the finer model ahead of the switch.
		const activeZoom = minZoom - 0.5;
		const fadeStart = Math.max(0, minZoom - 3);

		const opacityExpr: maplibregl.ExpressionSpecification | number =
			fadeStart < activeZoom
				? (['interpolate', ['linear'], ['zoom'], fadeStart, 0, activeZoom, 1] as const)
				: 1;

		const lineColorExpr: maplibregl.ExpressionSpecification = [
			'step',
			['zoom'],
			lineColor,
			activeZoom,
			activeLineColor
		];
		const textColorExpr: maplibregl.ExpressionSpecification = [
			'step',
			['zoom'],
			textColor,
			activeZoom,
			activeTextColor
		];

		// Dashed boundary outline
		map.addLayer(
			{
				id: `seamless-border-line-${i}`,
				type: 'line',
				source: SEAMLESS_BORDER_SOURCE_ID,
				minzoom: fadeStart,
				filter: ['==', ['get', 'layerIndex'], i],
				paint: {
					'line-color': lineColorExpr,
					'line-width': 1.5,
					'line-dasharray': [4, 3],
					'line-opacity': opacityExpr
				}
			},
			BEFORE_LAYER_VECTOR
		);

		// Domain name label placed along the border line
		map.addLayer(
			{
				id: `seamless-border-label-${i}`,
				type: 'symbol',
				source: SEAMLESS_BORDER_SOURCE_ID,
				minzoom: fadeStart,
				filter: ['==', ['get', 'layerIndex'], i],
				layout: {
					'text-field': ['get', 'label'],
					'text-size': 11,
					'symbol-placement': 'line',
					'symbol-spacing': 400,
					'text-rotation-alignment': 'map',
					'text-offset': [0, -0.8],
					'text-allow-overlap': false,
					'text-ignore-placement': true
				},
				paint: {
					'text-color': textColorExpr,
					'text-halo-color': textHalo,
					'text-halo-width': 1.5,
					'text-opacity': opacityExpr
				}
			},
			BEFORE_LAYER_VECTOR
		);
	}
};
