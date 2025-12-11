export const LEVEL_REGEX =
	/(?<height_level_to>\d+_to_.*)|(?<pressure_level>\d+hPa)|(?<height_level>\d+m|cm)/;

export const LEVEL_PREFIX =
	/(?<prefix>(cloud_cover|geopotential_height|relative_humidity|temperature|soil_moisture|soil_temperature|temperature|vertical_velocity|wind(?!_gusts|_direction)))_/;
export const LEVEL_UNIT_REGEX = /_(?<level>\d+)(?<unit>(m|cm|hPa))/;

export const VARIABLE_PREFIX =
	/(?<prefix>(cloud_cover|dew_point|geopotential_height|precipitation|relative_humidity|snow|temperature|soil_moisture|soil_temperature|temperature|vertical_velocity|wind(?!_gusts|_direction)))_/;
