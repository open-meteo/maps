const pressureLevels = [
	10, 15, 20, 30, 40, 50, 70, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300, 325, 350, 375, 400,
	425, 450, 475, 500, 525, 550, 575, 600, 625, 650, 675, 700, 725, 750, 775, 800, 825, 850, 875,
	900, 925, 950, 970, 975, 985, 1000, 1015
];

const heights = [
	2, 10, 20, 30, 40, 50, 75, 80, 100, 120, 150, 200, 250, 300, 400, 500, 600, 700, 800, 1000, 1250,
	1500, 1750, 2000, 2250, 2500, 2750, 3000, 3250, 3500, 3750, 4000, 4500, 5000, 5500, 6000
];

export const variables = [
	{ value: 'boundary_layer_height', label: 'Boundary Layer Height' },

	{ value: 'cape', label: 'CAPE' },

	{ value: 'categorical_freezing_rain', label: 'Categorical Freezing Rain' },

	{ value: 'cloud_base', label: 'Cloud Base' },
	{ value: 'cloud_cover', label: 'Cloud Cover' },
	{ value: 'cloud_cover_high', label: 'Cloud Cover High' },
	{ value: 'cloud_cover_mid', label: 'Cloud Cover Mid' },
	{ value: 'cloud_cover_low', label: 'Cloud Cover Low' },

	{ value: 'convective_cloud_base', label: 'Convective Cloud Base' },
	{ value: 'convective_cloud_top', label: 'Convective Cloud Top' },
	{ value: 'convective_inhibition', label: 'Convective Inhibition' },

	{ value: 'diffuse_radiation', label: 'Difuse Radiation' },
	{ value: 'direct_radiation', label: 'Direct Radiation' },

	{ value: 'freezing_level_height', label: 'Freezing Level Height' },
	{ value: 'freezing_rain_probability', label: 'Freezing Rain Probability' },

	{ value: 'latent_heat_flux', label: 'Latent Heat Flux' },
	{ value: 'sensible_heat_flux', label: 'Sensible Heat Flux' },

	{ value: 'ice_pellets_probability', label: 'Ice Pellets Probability' },

	{ value: 'lifted_index', label: 'Lifted Index' },
	{ value: 'lightning_potential', label: 'Lightning Potential' },

	{ value: 'mass_density_8m', label: 'Mass Density (8m)' },

	{ value: 'precipitation', label: 'Precipitation' },
	{ value: 'precipitation_probability', label: 'Precipitation Probability' },

	{ value: 'pressure_msl', label: 'Pressure Mean Sea Level' },

	{ value: 'rain', label: 'Rain' },
	{ value: 'rain_probability', label: 'Rain Probability' },

	{ value: 'showers', label: 'Showers' },

	{ value: 'snow', label: 'Snow' },
	{ value: 'snow_depth', label: 'Snow Depth' },

	{ value: 'snowfall', label: 'Snowfall' },
	{ value: 'snowfall_probability', label: 'Snowfall Probability' },
	{ value: 'snowfall_height', label: 'Snowfall Height' },
	{ value: 'snowfall_water_equivalent', label: 'Snow Water Equivalent' },

	{ value: 'shortwave_radiation', label: 'Shortwave Solar Radiation' },

	{ value: 'sunshine_duration', label: 'Sunshine Duration' },

	{ value: 'surface_temperature', label: 'Surface Temperature' },

	{ value: 'swell_wave_height', label: 'Swell Wave Height' },
	{ value: 'swell_wave_peak_period', label: 'Swell Wave Peak Period' },
	{ value: 'swell_wave_period', label: 'Swell Wave Period' },

	{ value: 'secondary_swell_wave_height', label: 'Secondary Swell Wave Height' },
	{ value: 'secondary_swell_wave_period', label: 'Secondary Swell Wave Period' },

	{ value: 'thunderstorm_probability', label: 'Thunderstorm probability' },

	{ value: 'total_column_integrated_water_vapour', label: 'Total Column Integrated Water Vapour' },

	{ value: 'uv_index', label: 'UV Index' },
	{ value: 'uv_index_clear_sky', label: 'UV Index Clear Sky' },

	{ value: 'visibility', label: 'Visibility' },

	{ value: 'wave_height', label: 'Wave Height & Direction' },
	{ value: 'wave_period', label: 'Wave Period' },

	{ value: 'weather_code', label: 'Weather Codes' },

	{ value: 'wind_gusts_10m', label: 'Wind Gusts 10m' },

	{ value: 'wind_wave_height', label: 'Wind Wave Height' },
	{ value: 'wind_wave_period', label: 'Wind Wave Period' },

	{ value: 'updraft', label: 'Updraft' },

	{ value: 'soil_temperature_0cm', label: 'Soil Temperature (0 cm)' },
	{ value: 'soil_temperature_6cm', label: 'Soil Temperature (6 cm)' },
	{ value: 'soil_temperature_18cm', label: 'Soil Temperature (18 cm)' },
	{ value: 'soil_temperature_54cm', label: 'Soil Temperature (54 cm)' },
	{ value: 'soil_temperature_0_to_7cm', label: 'Soil Temperature (0-7 cm)' },
	{ value: 'soil_temperature_0_to_10cm', label: 'Soil Temperature (0-10 cm)' },
	{ value: 'soil_temperature_7_to_28cm', label: 'Soil Temperature (7-28 cm)' },
	{ value: 'soil_temperature_10_to_40cm', label: 'Soil Temperature (10-40 cm)' },
	{ value: 'soil_temperature_40_to_100cm', label: 'Soil Temperature (40-100 cm)' },
	{ value: 'soil_temperature_100_to_200cm', label: 'Soil Temperature (100-200 cm)' },

	{ value: 'soil_moisture_0_to_1cm', label: 'Soil Moisture (0-1 cm)' },
	{ value: 'soil_moisture_0_to_7cm', label: 'Soil Moisture (0-7 cm)' },
	{ value: 'soil_moisture_1_to_3cm', label: 'Soil Moisture (1-3 cm)' },
	{ value: 'soil_moisture_3_to_9cm', label: 'Soil Moisture (3-9 cm)' },
	{ value: 'soil_moisture_0_to_10cm', label: 'Soil Moisture (0-10 cm)' },
	{ value: 'soil_moisture_7_to_28cm', label: 'Soil Moisture (7-28 cm)' },
	{ value: 'soil_moisture_9_to_27cm', label: 'Soil Moisture (9-27 cm)' },
	{ value: 'soil_moisture_10_to_40cm', label: 'Soil Moisture (10-40 cm)' },
	{ value: 'soil_moisture_27_to_81cm', label: 'Soil Moisture (27-81 cm)' },
	{ value: 'soil_moisture_40_to_100cm', label: 'Soil Moisture (40-100 cm)' },
	{ value: 'soil_moisture_100_to_200cm', label: 'Soil Moisture (100-200 cm)' }
];

for (const pl of pressureLevels) {
	variables.push({ value: `cloud_cover_${pl}hPa`, label: `Cloud Cover ${pl}hPa` });
	variables.push({ value: `geopotential_height_${pl}hPa`, label: `Geopotential Height ${pl}hPa` });
	variables.push({ value: `relative_humidity_${pl}hPa`, label: `Relative Humidity ${pl}hPa` });
	variables.push({ value: `temperature_${pl}hPa`, label: `Temperature ${pl}hPa` });
	variables.push({ value: `vertical_velocity_${pl}hPa`, label: `Vertical Velocity ${pl}hPa` });
	variables.push({ value: `wind_${pl}hPa`, label: `Wind ${pl}hPa` });
	variables.push({ value: `wind_u_component_${pl}hPa`, label: `Wind ${pl}hPa` });
	variables.push({ value: `wind_speed_${pl}hPa`, label: `Wind ${pl}hPa` });
}
for (const height of heights) {
	variables.push({ value: `relative_humidity_${height}m`, label: `Relative Humidity ${height}m` });
	variables.push({ value: `temperature_${height}m`, label: `Temperature ${height}m` });
	variables.push({ value: `wind_${height}m`, label: `Wind ${height}m` });
	variables.push({ value: `wind_u_component_${height}m`, label: `Wind ${height}m` });
	variables.push({ value: `wind_speed_${height}m`, label: `Wind ${height}m` });
}

export const hideZero = [
	'rain',
	'cloud_cover',
	'precipitation',
	'convective_cloud_top',
	'convective_cloud_base'
];

export const drawOnTiles = ['pressure_msl'];
