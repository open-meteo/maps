// Domain and variable defaults
export const DEFAULT_DOMAIN = 'dwd_icon';
export const DEFAULT_VARIABLE = 'temperature_2m';

// Vector options defaults
export const DEFAULT_VECTOR_OPTIONS = {
	grid: false,
	arrows: true,
	// 'arrow' = plain arrow, 'barb' = station-model wind barbs
	arrowStyle: 'arrow' as const,
	// 'line' = tile geometry (scales with the zoom), 'icon' = map symbols
	arrowRender: 'line' as const,
	// Icon size multiplier and the spacing between icons, as a share of one.
	// Tile geometry is drawn between 0.71x and 1.41x its nominal size through a
	// zoom level, so an icon matching it exactly (scale 1) reads as small for
	// most of that range; 1.2 sits nearer the size the geometry usually has.
	arrowIconScale: 1.2,
	arrowPacking: 0.85,
	contours: false,
	breakpoints: true,
	contourInterval: 2,
	// Animated flow (particle) style: density and width are ×-factors on a
	// viewport-scaled baseline (see PARTICLE_BASE_* / PARTICLE_REF_AREA), so
	// one default reads the same on a 4K monitor and a phone. Speed is screen
	// px/s per m/s of wind, trail is persistence per frame at 60fps (higher =
	// longer), opacity is the trail opacity (the light theme scales it down —
	// dark strokes read heavier than light ones). All screen-relative, so one
	// set of defaults reads the same at every zoom level.
	particleDensity: 1,
	particleWidth: 1,
	particleSpeed: 3,
	particleTrail: 0.955,
	particleOpacity: 0.7
};

// The particle baselines at factor x1 on the reference viewport: the count and
// stroke width tuned on a 4K screen at 1.25 browser zoom (~3072x1728 CSS px).
// Smaller viewports scale them down via particleViewportScale (layers.ts):
// count ∝ s and width ∝ √s with s = cbrt(area/ref) — a typical phone (s ≈ 0.4)
// lands at ~8k particles of ~1.6px.
export const PARTICLE_BASE_COUNT = 20000;
export const PARTICLE_BASE_WIDTH_PX = 2.5;
export const PARTICLE_REF_AREA = 3072 * 1728;

// Preferences defaults
export const DEFAULT_PREFERENCES = {
	globe: false,
	terrain: false,
	hillshade: false,
	clipWater: false,
	showScale: true,
	showSeamlessBorders: true
};

// Layer names for map rendering
export const HILLSHADE_LAYER = 'hillshadeLayer';
export const BEFORE_LAYER_RASTER = 'waterway-tunnel';
export const BEFORE_LAYER_VECTOR = 'place_label_other';
export const BEFORE_LAYER_VECTOR_WATER_CLIP = 'water-clip';

// Default tile size and opacity
export const DEFAULT_TILE_SIZE = 512;
export const DEFAULT_OPACITY = 75;

// Default raster interpolation method ('nearest' | 'linear' | 'cubic' | 'monotone')
export const DEFAULT_INTERPOLATION = 'linear' as const;

// Interpolate colours between colour-scale breakpoints instead of hard bands.
export const DEFAULT_COLOR_BLEND = false;

// Cache defaults (in KB and MB for UI display)
export const DEFAULT_CACHE_BLOCK_SIZE_KB = 64;
export const DEFAULT_CACHE_MAX_BYTES_MB = 400;

// Measured HTTP/2 overhead per range request (~1342 bytes: HPACK headers + framing).
// Rounded up to 1408 for safety margin (Range/Content-Range header lengths vary with file offset).
// Subtracted from block size so total transfer fits within the nominal KiB boundary.
export const HTTP_OVERHEAD_BYTES = 1408;

// Complete default values for URL parameter checking
export const COMPLETE_DEFAULT_VALUES: { [key: string]: boolean | string | number } = {
	domain: DEFAULT_DOMAIN,
	variable: DEFAULT_VARIABLE,
	...DEFAULT_PREFERENCES,
	...DEFAULT_VECTOR_OPTIONS
};

// Time constants
export const MILLISECONDS_PER_SECOND = 1000; // 1 second in milliseconds
export const MILLISECONDS_PER_MINUTE = 60 * MILLISECONDS_PER_SECOND; // 1 minute in milliseconds
export const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE; // 1 hour in milliseconds
export const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR; // 1 day in milliseconds
export const MILLISECONDS_PER_WEEK = 7 * MILLISECONDS_PER_DAY; // 7 days in milliseconds

// Metadata refresh interval
export const METADATA_REFRESH_INTERVAL = 5 * MILLISECONDS_PER_MINUTE; // 5 minutes in milliseconds

// Calendar display constants
export const DAY_NAMES = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday'
];
