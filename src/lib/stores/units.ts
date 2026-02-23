import { derived } from 'svelte/store';

import { persisted } from 'svelte-persisted-store';

export type TemperatureUnit = '°C' | '°F';
export type PrecipitationUnit = 'mm' | 'inch';
export type WindSpeedUnit = 'm/s' | 'km/h' | 'mph' | 'knots';

export const DEFAULT_TEMPERATURE_UNIT: TemperatureUnit = '°C';
export const DEFAULT_PRECIPITATION_UNIT: PrecipitationUnit = 'mm';
export const DEFAULT_WIND_SPEED_UNIT: WindSpeedUnit = 'm/s';

export const temperatureUnit = persisted<TemperatureUnit>(
	'temperature_unit',
	DEFAULT_TEMPERATURE_UNIT
);
export const precipitationUnit = persisted<PrecipitationUnit>(
	'precipitation_unit',
	DEFAULT_PRECIPITATION_UNIT
);
export const windSpeedUnit = persisted<WindSpeedUnit>('wind_speed_unit', DEFAULT_WIND_SPEED_UNIT);

// --- Conversion functions (from base SI unit to selected unit) ---

export function convertTemperature(value: number, unit: TemperatureUnit): number {
	if (unit === '°F') return value * 1.8 + 32;
	return value;
}

export function convertPrecipitation(value: number, unit: PrecipitationUnit): number {
	if (unit === 'inch') return value / 25.4;
	return value;
}

export function convertWindSpeed(value: number, unit: WindSpeedUnit): number {
	switch (unit) {
		case 'km/h':
			return value * 3.6;
		case 'mph':
			return value * 2.23694;
		case 'knots':
			return value * 1.94384;
		default:
			return value;
	}
}

/** Map a base unit string from the color scale to the corresponding unit category. */
export type UnitCategory = 'temperature' | 'precipitation' | 'wind_speed';

export function getUnitCategory(baseUnit: string): UnitCategory | undefined {
	switch (baseUnit) {
		case '°C':
		case 'K':
			return 'temperature';
		case 'mm':
			return 'precipitation';
		case 'm/s':
			return 'wind_speed';
		default:
			return undefined;
	}
}

/** Convert a value from its base unit to the user's selected unit. */
export function convertValue(
	value: number,
	baseUnit: string,
	units: {
		temperature: TemperatureUnit;
		precipitation: PrecipitationUnit;
		windSpeed: WindSpeedUnit;
	}
): number {
	const category = getUnitCategory(baseUnit);
	switch (category) {
		case 'temperature':
			return convertTemperature(value, units.temperature);
		case 'precipitation':
			return convertPrecipitation(value, units.precipitation);
		case 'wind_speed':
			return convertWindSpeed(value, units.windSpeed);
		default:
			return value;
	}
}

/** Get the display unit string for a base unit given user preferences. */
export function getDisplayUnit(
	baseUnit: string,
	units: {
		temperature: TemperatureUnit;
		precipitation: PrecipitationUnit;
		windSpeed: WindSpeedUnit;
	}
): string {
	const category = getUnitCategory(baseUnit);
	switch (category) {
		case 'temperature':
			return units.temperature;
		case 'precipitation':
			return units.precipitation;
		case 'wind_speed':
			return units.windSpeed;
		default:
			return baseUnit;
	}
}

/** Option arrays for each unit category. */
export const temperatureOptions: { value: TemperatureUnit; label: string }[] = [
	{ value: '°C', label: '°C' },
	{ value: '°F', label: '°F' }
];

export const precipitationOptions: { value: PrecipitationUnit; label: string }[] = [
	{ value: 'mm', label: 'mm' },
	{ value: 'inch', label: 'inch' }
];

export const windSpeedOptions: { value: WindSpeedUnit; label: string }[] = [
	{ value: 'm/s', label: 'm/s' },
	{ value: 'km/h', label: 'km/h' },
	{ value: 'mph', label: 'mph' },
	{ value: 'knots', label: 'knots' }
];

/** Get the unit options for a given base unit string. Returns undefined if the unit has no alternatives. */
export function getUnitOptions(baseUnit: string): { value: string; label: string }[] | undefined {
	const category = getUnitCategory(baseUnit);
	switch (category) {
		case 'temperature':
			return temperatureOptions;
		case 'precipitation':
			return precipitationOptions;
		case 'wind_speed':
			return windSpeedOptions;
		default:
			return undefined;
	}
}

/** Set the unit for a given base unit category. */
export function setUnitForCategory(baseUnit: string, newUnit: string): void {
	const category = getUnitCategory(baseUnit);
	switch (category) {
		case 'temperature':
			temperatureUnit.set(newUnit as TemperatureUnit);
			break;
		case 'precipitation':
			precipitationUnit.set(newUnit as PrecipitationUnit);
			break;
		case 'wind_speed':
			windSpeedUnit.set(newUnit as WindSpeedUnit);
			break;
	}
}

/** Derived store combining all unit preferences into a single object. */
export const unitPreferences = derived(
	[temperatureUnit, precipitationUnit, windSpeedUnit],
	([$t, $p, $w]) => ({
		temperature: $t,
		precipitation: $p,
		windSpeed: $w
	})
);
