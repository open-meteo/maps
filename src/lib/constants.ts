// Domain and variable defaults
export const DEFAULT_DOMAIN = 'dwd_icon';
export const DEFAULT_VARIABLE = 'temperature_2m';

// Vector options defaults
export const DEFAULT_VECTOR_OPTIONS = {
    grid: false,
    arrows: true,
    contours: false,
    breakpoints: true,
    contourInterval: 2
};

// Preferences defaults
export const DEFAULT_PREFERENCES = {
    globe: false,
    terrain: false,
    hillshade: false,
    clipWater: false,
    showScale: true,
    crepuscule: false,
    timeSelector: true
};

// Color hash default
export const DEFAULT_COLOR_HASH = '';

// Layer names for map rendering
export const BEFORE_LAYER_RASTER = 'waterway-tunnel';
export const BEFORE_LAYER_VECTOR = 'place_label_other';
export const BEFORE_LAYER_VECTOR_WATER_CLIP = 'water-clip';

// Default tile size and resolution
export const DEFAULT_TILE_SIZE = 256;
export const DEFAULT_RESOLUTION = 1;
export const DEFAULT_OPACITY = 75;

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
