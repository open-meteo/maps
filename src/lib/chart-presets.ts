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
		id: 'z500_t850',
		label: '500 hPa Geopotential + 850 hPa Temperature',
		group: 'Upper-level',
		sources: [
			{ variable: 'geopotential_height_500hPa', raster: true },
			{ variable: 'temperature_850hPa', contours: true, contourInterval: 2 }
		]
	},
	{
		id: 'z500_t500',
		label: '500 hPa Geopotential + Temperature',
		group: 'Upper-level',
		sources: [
			{ variable: 'temperature_500hPa', raster: true },
			{ variable: 'geopotential_height_500hPa', contours: true, contourInterval: 4 }
		]
	},
	{
		id: 'z300_wind300',
		label: '300 hPa Geopotential + Wind',
		group: 'Upper-level',
		sources: [
			{ variable: 'geopotential_height_300hPa', contours: true, contourInterval: 4 },
			{ variable: 'wind_u_component_300hPa', raster: true, arrows: true }
		]
	},
	{
		id: 'wind200_mslp',
		label: 'MSLP + 200 hPa Wind (Jet Stream)',
		group: 'Upper-level',
		sources: [
			{ variable: 'pressure_msl', contours: true, contourInterval: 5 },
			{ variable: 'wind_u_component_200hPa', raster: true, arrows: true }
		]
	},
	{
		id: 'wind850_mslp',
		label: 'MSLP + 850 hPa Wind',
		group: 'Upper-level',
		sources: [
			{ variable: 'pressure_msl', contours: true, contourInterval: 5 },
			{ variable: 'wind_u_component_850hPa', raster: true, arrows: true }
		]
	},
	{
		id: 'rh700_z500',
		label: '700 hPa Relative Humidity + 500 hPa Geopotential',
		group: 'Upper-level',
		sources: [
			{ variable: 'relative_humidity_700hPa', raster: true },
			{ variable: 'geopotential_height_500hPa', contours: true, contourInterval: 4 }
		]
	},
	{
		id: 'vvel500_z500',
		label: '500 hPa Vertical Velocity + Geopotential',
		group: 'Upper-level',
		sources: [
			{ variable: 'vertical_velocity_500hPa', raster: true },
			{ variable: 'geopotential_height_500hPa', contours: true, contourInterval: 4 }
		]
	},
	{
		id: 't850_z850',
		label: '850 hPa Temperature + Geopotential',
		group: 'Upper-level',
		sources: [
			{ variable: 'temperature_850hPa', raster: true },
			{ variable: 'geopotential_height_850hPa', contours: true, contourInterval: 2 }
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
			{ variable: 'wind_u_component_10m', arrows: true }
		]
	},
	{
		id: 't2m_mslp',
		label: '2 m Temperature + MSLP',
		group: 'Surface',
		sources: [
			{ variable: 'temperature_2m', raster: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 5 }
		]
	},
	{
		id: 'wind100m_mslp',
		label: '100 m Wind + MSLP',
		group: 'Surface',
		sources: [
			{ variable: 'wind_u_component_100m', raster: true, arrows: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 5 }
		]
	},
	{
		id: 'wind10m_gusts',
		label: '10 m Wind Gusts + Wind',
		group: 'Surface',
		sources: [
			{ variable: 'wind_gusts_10m', raster: true },
			{ variable: 'wind_u_component_10m', arrows: true }
		]
	},
	{
		id: 'cape_mslp',
		label: 'CAPE + MSLP',
		group: 'Surface',
		sources: [
			{ variable: 'cape', raster: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 5 }
		]
	},
	{
		id: 'tcwv_mslp',
		label: 'Total Column Water Vapour + MSLP',
		group: 'Surface',
		sources: [
			{ variable: 'total_column_integrated_water_vapour', raster: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 5 }
		]
	},
	{
		id: 'cloud_cover',
		label: 'Cloud Cover',
		group: 'Surface',
		sources: [{ variable: 'cloud_cover', raster: true }]
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
	},
	{
		id: 'snowfall_mslp',
		label: 'Snowfall + MSLP',
		group: 'Precipitation',
		sources: [
			{ variable: 'snowfall', raster: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 5 }
		]
	},
	{
		id: 'freezing_level',
		label: 'Freezing Level Height + MSLP',
		group: 'Precipitation',
		sources: [
			{ variable: 'freezing_level_height', raster: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 5 }
		]
	}
];
