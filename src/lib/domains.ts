import { get } from 'svelte/store';

import { type Domain, domainOptions as libraryDomainOptions } from '@openmeteo/weather-map-layer';
import { persisted } from 'svelte-persisted-store';

export type NativeGridSource = 'analytical' | 'file';

/**
 * Geometry of the global native ICON domains: the library's analytical grid
 * with its warp table, or the backend's cell index (grid.bin, 65 MB fetched
 * once) through the file-backed grid. Read once when the domain list is built;
 * changing it restarts the page (see native-grid-settings.svelte).
 */
export const nativeGridSource = persisted<NativeGridSource>('native-grid-source', 'analytical');

const GLOBAL_NATIVE_CELL_INDEX =
	'https://openmeteo.s3.amazonaws.com/data/dwd_icon_global_native/static/grid.bin';

// AICON writes its output on the ICON global grid, so both share the cell index
const GLOBAL_NATIVE_DOMAINS = ['dwd_icon_global_native', 'dwd_aicon_global_native'];

/** The library's domains, with the global native ICON grid swapped per the setting. */
export const domainOptions: Domain[] = libraryDomainOptions.map((domain): Domain =>
	GLOBAL_NATIVE_DOMAINS.includes(domain.value) && get(nativeGridSource) === 'file'
		? {
				...domain,
				label: `${domain.label} (grid.bin)`,
				grid: {
					type: 'latband',
					nx: domain.grid.nx,
					ny: 1,
					geometry: GLOBAL_NATIVE_CELL_INDEX,
					zoom: domain.grid.zoom
				}
			}
		: domain
);
