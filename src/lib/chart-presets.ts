/**
 * Predefined chart presets, each containing one or more map sources.
 *
 * A "source" defines a variable to fetch and which layer types to render
 * (raster, contours, arrows). When a preset is activated the multi-source
 * manager creates independent SlotManager pairs for every source so they
 * all load and display simultaneously.
 */

export interface ChartSource {
	/** Variable name passed in the om:// URL (e.g. `geopotential_height_500hPa`). */
	variable: string;
	/** Show the raster (colour fill) layer for this source. Default: false */
	raster?: boolean;
	/** Show contour lines for this source. Default: false */
	contours?: boolean;
	/** Contour interval (only used when `contours` is true). */
	contourInterval?: number;
	/** Show wind arrow vectors for this source. Default: false */
	arrows?: boolean;
}

export interface ChartPreset {
	/** Unique identifier — also used as the `chart` URL parameter. */
	id: string;
	/** Human-readable name shown in the selector. */
	label: string;
	/** Optional grouping label (e.g. "Upper-level", "Surface"). */
	group?: string;
	/** One or more sources rendered together on the map. */
	sources: ChartSource[];
}

export const chartPresets: ChartPreset[] = [
	// ── Upper-level ─────────────────────────────────────────────────────
	{
		id: 'z500',
		label: '500 hPa Geopotential Height',
		group: 'Upper-level',
		sources: [{ variable: 'geopotential_height_500hPa', raster: true }]
	},
	{
		id: 'z500_t850',
		label: '500 hPa Geopotential + 850 hPa Temperature',
		group: 'Upper-level',
		sources: [
			{ variable: 'geopotential_height_500hPa', raster: true },
			{ variable: 'temperature_850hPa', contours: true, contourInterval: 2 }
		]
	},
	{
		id: 't850',
		label: '850 hPa Temperature',
		group: 'Upper-level',
		sources: [{ variable: 'temperature_850hPa', raster: true, contours: true, contourInterval: 2 }]
	},
	{
		id: 'wind200_mslp',
		label: 'MSLP + 200 hPa Wind (Jet Stream)',
		group: 'Upper-level',
		sources: [
			{ variable: 'pressure_msl', contours: true, contourInterval: 5 },
			{ variable: 'wind_speed_200hPa', raster: true, arrows: true }
		]
	},
	{
		id: 'wind850_mslp',
		label: 'MSLP + 850 hPa Wind Speed',
		group: 'Upper-level',
		sources: [
			{ variable: 'pressure_msl', contours: true, contourInterval: 5 },
			{ variable: 'wind_speed_850hPa', raster: true, arrows: true }
		]
	},
	// ── Surface ─────────────────────────────────────────────────────────
	{
		id: 'mslp',
		label: 'Mean Sea Level Pressure',
		group: 'Surface',
		sources: [{ variable: 'pressure_msl', raster: true, contours: true, contourInterval: 5 }]
	},
	{
		id: 't2m_wind10m',
		label: '2 m Temperature + 10 m Wind',
		group: 'Surface',
		sources: [
			{ variable: 'temperature_2m', raster: true },
			{ variable: 'wind_speed_10m', arrows: true }
		]
	},
	{
		id: 'wind100m_mslp',
		label: '100 m Wind + MSLP',
		group: 'Surface',
		sources: [
			{ variable: 'wind_speed_100m', raster: true, arrows: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 5 }
		]
	},
	// ── Precipitation ───────────────────────────────────────────────────
	{
		id: 'rain_mslp',
		label: 'Precipitation + MSLP',
		group: 'Precipitation',
		sources: [
			{ variable: 'precipitation', raster: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 5 }
		]
	}
];
