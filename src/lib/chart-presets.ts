/**
 * Predefined chart presets and the curated list of popular variables shown
 * directly in the selection panel.
 */
import type { ChartPreset } from '$lib/chart-types';

export const chartPresets: ChartPreset[] = [
	// ── Synoptic ─────────────────────────────────────────────────────
	{
		id: 'z500_t850',
		label: '850 hPa Temperature + 500 hPa Geopotential',
		description: 'Synoptic flow with airmass temperature',
		group: 'Synoptic',
		sources: [
			{ variable: 'temperature_850hPa', raster: true },
			{ variable: 'geopotential_height_500hPa', contours: true, contourInterval: 12.5 }
		]
	},
	{
		id: 'z500_mslp',
		label: '500 hPa Geopotential + MSLP',
		description: 'Upper-level flow over surface pressure',
		group: 'Synoptic',
		sources: [
			{
				variable: 'geopotential_height_500hPa',
				raster: true,
				contours: true,
				contourInterval: 12.5
			},
			{ variable: 'pressure_msl', contours: true, contourInterval: 5 }
		]
	},
	{
		id: 'z500_t500',
		label: '500 hPa Temperature + Geopotential',
		description: '500 hPa temperature under height contours',
		group: 'Synoptic',
		sources: [
			{ variable: 'temperature_500hPa', raster: true },
			{ variable: 'geopotential_height_500hPa', contours: true, contourInterval: 12.5 }
		]
	},
	{
		id: 'z300_wind300',
		label: '300 hPa Wind + Geopotential',
		description: 'Jet-level winds and 300 hPa heights',
		group: 'Synoptic',
		sources: [
			{ variable: 'wind_u_component_300hPa', raster: true, arrows: true, opacity: 0.7 },
			{ variable: 'geopotential_height_300hPa', contours: true, contourInterval: 12.5 }
		]
	},
	{
		id: 'wind200_mslp',
		label: 'MSLP + 200 hPa Wind (Jet Stream)',
		description: 'Jet stream over surface pressure',
		group: 'Synoptic',
		sources: [
			{ variable: 'wind_u_component_200hPa', raster: true, arrows: true, opacity: 0.7 },
			{ variable: 'pressure_msl', contours: true, contourInterval: 2 }
		]
	},
	{
		id: 'wind850_mslp',
		label: 'MSLP + 850 hPa Wind',
		description: 'Low-level winds over surface pressure',
		group: 'Synoptic',
		sources: [
			{ variable: 'wind_u_component_850hPa', raster: true, arrows: true, opacity: 0.8 },
			{ variable: 'pressure_msl', contours: true, contourInterval: 2 }
		]
	},
	{
		id: 'rh700_z500',
		label: '700 hPa Relative Humidity + 500 hPa Geopotential',
		description: 'Mid-level moisture with 500 hPa heights',
		group: 'Synoptic',
		sources: [
			{ variable: 'relative_humidity_700hPa', raster: true },
			{ variable: 'geopotential_height_500hPa', contours: true, contourInterval: 12.5 }
		]
	},
	{
		id: 'vvel500_z500',
		label: '500 hPa Vertical Velocity + Geopotential',
		description: 'Rising and sinking air at 500 hPa',
		group: 'Synoptic',
		sources: [
			{ variable: 'vertical_velocity_500hPa', raster: true },
			{ variable: 'geopotential_height_500hPa', contours: true, contourInterval: 12.5 }
		]
	},
	{
		id: 't850_z850',
		label: '850 hPa Temperature + Geopotential',
		description: '850 hPa temperature and heights',
		group: 'Synoptic',
		sources: [
			{ variable: 'temperature_850hPa', raster: true },
			{ variable: 'geopotential_height_850hPa', contours: true, contourInterval: 12.5 }
		]
	},
	// ── Surface ─────────────────────────────────────────────────────────
	{
		id: 'mslp',
		label: 'Mean Sea Level Pressure',
		description: 'Surface pressure field with isobars',
		group: 'Surface',
		sources: [{ variable: 'pressure_msl', raster: true, contours: true, contourInterval: 2 }]
	},
	{
		id: 't2m_wind10m',
		label: '2 m Temperature + 10 m Wind',
		description: 'Surface temperature and wind',
		group: 'Surface',
		sources: [
			{ variable: 'temperature_2m', raster: true },
			{ variable: 'wind_u_component_10m', arrows: true }
		]
	},
	{
		id: 't2m_mslp',
		label: '2 m Temperature + MSLP',
		description: 'Surface temperature with isobars',
		group: 'Surface',
		sources: [
			{ variable: 'temperature_2m', raster: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 2 }
		]
	},
	{
		id: 'wind100m_mslp',
		label: '100 m Wind + MSLP',
		description: 'Hub-height wind over surface pressure',
		group: 'Surface',
		sources: [
			{ variable: 'wind_u_component_100m', raster: true, arrows: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 2 }
		]
	},
	{
		id: 'wind10m_gusts',
		label: '10 m Wind Gusts + Wind',
		description: 'Gust strength with wind direction',
		group: 'Surface',
		sources: [
			{ variable: 'wind_gusts_10m', raster: true },
			{ variable: 'wind_u_component_10m', arrows: true }
		]
	},
	{
		id: 'cape_mslp',
		label: 'CAPE + MSLP',
		description: 'Thunderstorm potential with isobars',
		group: 'Surface',
		sources: [
			{ variable: 'cape', raster: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 2 }
		]
	},
	{
		id: 'tcwv_mslp',
		label: 'Total Column Water Vapour + MSLP',
		description: 'Atmospheric moisture with isobars',
		group: 'Surface',
		sources: [
			{ variable: 'total_column_integrated_water_vapour', raster: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 2 }
		]
	},
	{
		id: 'cloud_cover',
		label: 'Cloud Cover (High/Mid/Low)',
		description: 'Cloud layers, blue over green over red',
		group: 'Surface',
		// Painted top-down, so the low deck stays legible over the layers above
		// it. Each level has its own colour scale; the opacities let a level
		// show through the ones below even at full coverage.
		sources: [
			{ variable: 'cloud_cover_high', raster: true },
			{ variable: 'cloud_cover_mid', raster: true, opacity: 0.85 },
			{ variable: 'cloud_cover_low', raster: true, opacity: 0.75 }
		]
	},
	// ── Precipitation ───────────────────────────────────────────────────
	{
		id: 'rain_mslp',
		label: 'Precipitation + MSLP',
		description: 'Precipitation with isobars',
		group: 'Precipitation',
		sources: [
			{ variable: 'precipitation', raster: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 5 }
		]
	},
	{
		id: 'snowfall_mslp',
		label: 'Snowfall + MSLP',
		description: 'Snowfall with isobars',
		group: 'Precipitation',
		sources: [
			{ variable: 'snowfall', raster: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 5 }
		]
	},
	{
		id: 'freezing_level',
		label: 'Freezing Level Height + MSLP',
		description: 'Freezing level height with isobars',
		group: 'Precipitation',
		sources: [
			{ variable: 'freezing_level_height', raster: true },
			{ variable: 'pressure_msl', contours: true, contourInterval: 5 }
		]
	},
	{
		id: 'cloud_rain',
		label: 'Cloud cover + Precip',
		description: 'Cloud and precipitation',
		group: 'Precipitation',
		sources: [
			// inlineVectors: the arrows render directly on the wind raster, so
			// the cloud and precipitation rasters above overlap them
			{ variable: 'cloud_cover', raster: true },
			{ variable: 'precipitation', raster: true }
		]
	},
	{
		id: 'wind_cloud_rain',
		label: 'Wind + Cloud cover + Precip',
		description: 'Wind arrows under cloud and precipitation',
		group: 'Precipitation',
		sources: [
			// inlineVectors: the arrows render directly on the wind raster, so
			// the cloud and precipitation rasters above overlap them
			{
				variable: 'wind_u_component_10m',
				raster: true,
				arrows: true,
				inlineVectors: true,
				opacity: 0.7
			},
			{ variable: 'cloud_cover', raster: true, opacity: 0.7 },
			{ variable: 'precipitation', raster: true }
		]
	}
];

export const getChartPreset = (id: string): ChartPreset | undefined =>
	chartPresets.find((preset) => preset.id === id);

export interface PopularVariable {
	/** Variable id, or level-group prefix when `levelGroup` is true. */
	id: string;
	/** Apply this chart preset instead of a plain variable. */
	presetId?: string;
	/** Label override; defaults to the variableOptions label. */
	label?: string;
	/** True when `id` is a level-group prefix (e.g. `wind`, `temperature`). */
	levelGroup?: boolean;
	/** Preferred level suffix when the group is picked, e.g. `10m`, `850hPa`. */
	defaultLevel?: string;
}

/**
 * Curated variables shown directly in the selection panel, filtered at render
 * time by what the current domain actually serves.
 */
export const popularVariables: PopularVariable[] = [
	{ id: 'temperature', label: 'Temperature', levelGroup: true, defaultLevel: '2m' },
	{ id: 'wind', label: 'Wind', levelGroup: true, defaultLevel: '10m' },
	{ id: 'wind_gusts_10m', label: 'Wind Gusts' },
	{ id: 'pressure_msl', label: 'Pressure Mean Sea Level', presetId: 'mslp' },
	{ id: 'cloud_cover' },
	{ id: 'relative_humidity', label: 'Relative Humidity', levelGroup: true, defaultLevel: '2m' },
	// { id: 'cape' },
	{ id: 'precipitation' },
	// ── Domain-specific entries below: the availability filter hides them
	// everywhere else, since only these domains serve the variables. ──────
	// Ensemble domains (dwd_icon_*_eps, ncep_gefs*)
	{ id: 'precipitation_probability' },

	{ id: 'snowfall' },

	// Air-quality domains (cams_*)
	{ id: 'pm2_5' },
	{ id: 'pm10' },
	{ id: 'ozone' },
	{ id: 'nitrogen_dioxide' },
	{ id: 'dust' },
	{ id: 'uv_index' },
	// Marine domains (ecmwf_wam*, dwd_*wam, ncep_gfswave*, meteofrance_wave)
	{ id: 'wave_height' },
	{ id: 'wave_period' },
	{ id: 'swell_wave_height' }
];
