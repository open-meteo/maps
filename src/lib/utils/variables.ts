const pressureLevels = [
	30, 50, 70, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 850, 900, 925, 950, 975, 1000
];

const heights = [
	2, 20, 30, 50, 75, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 1000, 1250, 1500, 1750, 2000,
	2250, 2500, 2750, 3000, 3250, 3500, 3750, 4000, 4500, 5000, 5500, 6000
];

export const variables = [
	{ value: 'cape', label: 'CAPE' },

	{ value: 'cloud_cover', label: 'Cloud Cover' },
	{ value: 'cloud_cover_high', label: 'Cloud Cover High' },
	{ value: 'cloud_cover_mid', label: 'Cloud Cover Mid' },
	{ value: 'cloud_cover_low', label: 'Cloud Cover Low' },

	{ value: 'convective_cloud_base', label: 'Convective Cloud Base' },
	{ value: 'convective_cloud_top', label: 'Convective Cloud Top' },

	{ value: 'diffuse_radiation', label: 'Difuse Radiation' },
	{ value: 'direct_radiation', label: 'Direct Radiation' },

	{ value: 'freezing_level_height', label: 'Freezing Level Height' },

	{ value: 'latent_heat_flux', label: 'Latent Heat Flux' },
	{ value: 'sensible_heat_flux', label: 'Sensible Heat Flux' },

	{ value: 'precipitation', label: 'Precipitation' },
	{ value: 'precipitation_probability', label: 'Precipitation Probability' },
	{ value: 'rain', label: 'Rain' },
	{ value: 'showers', label: 'Showers' },
	{ value: 'thunderstorm_probability', label: 'Thunderstorm probability' },
	{ value: 'lightning_potential', label: 'Lightning Potential' },

	{ value: 'snow', label: 'Snow' },
	{ value: 'snow_depth', label: 'Snow Depth' },
	{ value: 'snowfall_height', label: 'Snowfall Height' },
	{ value: 'snowfall_water_equivalent', label: 'Snow Water Equivalent' },

	{ value: 'pressure_msl', label: 'Pressure Mean Sea Level' },

	{ value: 'shortwave_radiation', label: 'Shortwave Solar Radiation' },

	{ value: 'sunshine_duration', label: 'Sunshine Duration' },

	{ value: 'surface_temperature', label: 'Surface Temperature' },

	{ value: 'uv_index', label: 'UV Index' },

	{ value: 'visibility', label: 'Visibility' },

	{ value: 'weather_code', label: 'Weather Codes' },

	{ value: 'wind_gusts_10m', label: 'Wind Gusts 10m' },

	{ value: 'updraft', label: 'Updraft' },

	{ value: 'soil_temperature_0cm', label: 'Soil Temperature (0 cm)' },
	{ value: 'soil_temperature_6cm', label: 'Soil Temperature (6 cm)' },
	{ value: 'soil_temperature_18cm', label: 'Soil Temperature (18 cm)' },
	{ value: 'soil_temperature_54cm', label: 'Soil Temperature (54 cm)' },
	{ value: 'soil_temperature_0_to_7cm', label: 'Soil Temperature (0-7 cm)' },
	{ value: 'soil_temperature_7_to_28cm', label: 'Soil Temperature (7-28 cm)' },

	{ value: 'soil_moisture_0_to_1cm', label: 'Soil Moisture (0-1 cm)' },
	{ value: 'soil_moisture_0_to_7cm', label: 'Soil Moisture (0-7 cm)' },
	{ value: 'soil_moisture_1_to_3cm', label: 'Soil Moisture (1-3 cm)' },
	{ value: 'soil_moisture_3_to_9cm', label: 'Soil Moisture (3-9 cm)' },
	{ value: 'soil_moisture_7_to_28cm', label: 'Soil Moisture (7-28 cm)' },
	{ value: 'soil_moisture_9_to_27cm', label: 'Soil Moisture (9-27 cm)' },
	{ value: 'soil_moisture_27_to_81cm', label: 'Soil Moisture (27-81 cm)' }
];

for (const pl of pressureLevels) {
	variables.push({ value: `geopotential_height_${pl}hPa`, label: `Geopotential Height ${pl}hPa` });
	variables.push({ value: `temperature_${pl}hPa`, label: `Temperature ${pl}hPa` });
	variables.push({ value: `relative_humidity_${pl}hPa`, label: `Relative Humidity ${pl}hPa` });
	variables.push({ value: `wind_${pl}hPa`, label: `Wind ${pl}hPa` });
}
for (const height of heights) {
	variables.push({ value: `temperature_${height}m`, label: `Temperature ${height}m` });
	variables.push({ value: `relative_humidity_${height}m`, label: `Relative Humidity ${height}m` });
	variables.push({ value: `wind_${height}m`, label: `Wind ${height}m` });
}

export const hideZero = [
	'precipitation',
	'cloud_cover',
	'rain',
	'convective_cloud_top',
	'convective_cloud_base'
];
export const requestMultiple = [
	'wind_10m',
	'wind_40m',
	'wind_50m',
	'wind_80m',
	'wind_100m',
	'wind_120m',
	'wind_150m',
	'wind_180m'
];

export const drawOnTiles = [
	'wind_10m',
	'wind_40m',
	'wind_50m',
	'wind_80m',
	'wind_100m',
	'wind_120m',
	'wind_150m',
	'wind_180m',
	'pressure_msl'
];
