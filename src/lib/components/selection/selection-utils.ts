import {
	LEVEL_PREFIX,
	LEVEL_REGEX,
	LEVEL_UNIT_REGEX,
	variableOptions
} from '@openmeteo/weather-map-layer';

export interface VariableEntry {
	value: string;
	label: string;
}

export const variableLabel = (value: string): string =>
	variableOptions.find((option) => option.value === value)?.label ?? value;

/**
 * The domain's variables with level variants collapsed into their group
 * prefix (e.g. all temperature_XXXhPa become one `temperature` entry).
 */
export const buildVariableList = (metaVariables: string[]): string[] => {
	const variables: string[] = [];
	for (const metaVariable of metaVariables) {
		if (metaVariable.match(LEVEL_REGEX)) {
			const prefix = metaVariable.match(LEVEL_PREFIX)?.groups?.prefix;
			if (prefix) {
				if (!variables.includes(prefix)) variables.push(prefix);
				continue;
			}
		}
		variables.push(metaVariable);
	}
	return variables;
};

/**
 * Physical sort key: surface heights (cm, then m) ascending first, then
 * pressure levels from the ground up (1000 hPa before 30 hPa).
 */
const levelSortKey = (value: string): number => {
	const match = value.match(LEVEL_UNIT_REGEX);
	if (!match?.groups) return Number.MAX_SAFE_INTEGER;
	const level = Number(match.groups.level);
	switch (match.groups.unit) {
		case 'cm':
			return level;
		case 'm':
			return 10_000 + level;
		case 'hPa':
			return 100_000 + (2000 - level);
		default:
			return Number.MAX_SAFE_INTEGER;
	}
};

/**
 * Level variants per group prefix, physically sorted. Entries whose own
 * prefix does not equal the group are filtered out (e.g. wind_u_component_*
 * must not appear inside the `wind` group next to wind_speed_*).
 */
export const buildLevelGroups = (metaVariables: string[]): Record<string, VariableEntry[]> => {
	const groups: Record<string, VariableEntry[]> = {};
	for (const metaVariable of metaVariables) {
		if (!metaVariable.match(LEVEL_REGEX)) continue;
		const prefix = metaVariable.match(LEVEL_PREFIX)?.groups?.prefix;
		if (!prefix) continue;

		const entry = { value: metaVariable, label: variableLabel(metaVariable) };
		(groups[prefix] ??= []).push(entry);
	}
	for (const entries of Object.values(groups)) {
		entries.sort((a, b) => levelSortKey(a.value) - levelSortKey(b.value));
	}
	return groups;
};

/**
 * Scroll the selected Command item to the very top of its list once the
 * popover content has mounted. Call from `onOpenAutoFocus`.
 */
export const scrollSelectedToTop = (selectedValue: string | undefined): void => {
	if (!selectedValue) return;

	// The popover content mounts in a portal after the open state flips, and
	// the command list applies its own initial highlight scroll — retry a few
	// times so the final position wins.
	const attempt = (delays: number[]): void => {
		const [delay, ...rest] = delays;
		if (delay === undefined) return;
		setTimeout(() => {
			const item = document.querySelector(
				`[data-value="${CSS.escape(selectedValue)}"]`
			) as HTMLElement | null;
			const list = item?.closest('[data-slot="command-list"]') as HTMLElement | null;
			if (item && list) {
				// Relative rect math instead of scrollIntoView: it also works while
				// the popover's opening animation is transforming the content
				list.scrollTop += item.getBoundingClientRect().top - list.getBoundingClientRect().top;
			}
			attempt(rest);
		}, delay);
	};
	attempt([50, 150, 250]);
};

/**
 * Default level variant when a level group is picked: an explicitly preferred
 * suffix first, then near-surface levels, else the first entry.
 */
export const pickDefaultLevel = (
	entries: VariableEntry[],
	preferredLevel?: string
): string | undefined => {
	const usable = entries.filter(
		({ value }) => !value.includes('v_component') && !value.includes('_direction')
	);
	if (!usable.length) return undefined;

	if (preferredLevel) {
		const preferred = usable.find(({ value }) => value.endsWith(`_${preferredLevel}`));
		if (preferred) return preferred.value;
	}
	for (const level of ['2m', '10m', '100m']) {
		const match = usable.find(({ value }) => value.endsWith(`_${level}`));
		if (match) return match.value;
	}
	return usable[0].value;
};
