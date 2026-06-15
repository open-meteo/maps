import { domainOptions } from '@openmeteo/weather-map-layer';
import { describe, expect, it } from 'vitest';

import { getSeamlessWarmupOmUrls } from '$lib/url';

import type { SeamlessDomain } from '@openmeteo/weather-map-layer';

describe('getSeamlessWarmupOmUrls', () => {
	const gfsSeamless = domainOptions.find(
		(d) => d.value === 'ncep_gfs_seamless'
	) as SeamlessDomain;

	// The global fallback (ncep_gfs025) current URL, as the protocol's state holds it.
	const fallbackUrl =
		'https://map-tiles.open-meteo.com/data_spatial/ncep_gfs025/2025/01/01/0000Z/2025-01-01T0000.om';

	it('returns an empty list for a non-seamless domain', () => {
		const regular = domainOptions.find((d) => d.value === 'ncep_gfs025')!;
		expect(getSeamlessWarmupOmUrls(regular, fallbackUrl, undefined)).toEqual([]);
	});

	it('derives each sub-layer URL by swapping only the domain segment', () => {
		const urls = getSeamlessWarmupOmUrls(gfsSeamless, fallbackUrl, undefined);

		// The current timestep is warmed for every concrete sub-layer (incl. the
		// regional HRRR that the viewport gate may skip when loading data).
		expect(urls).toContain(
			'https://map-tiles.open-meteo.com/data_spatial/ncep_hrrr_conus/2025/01/01/0000Z/2025-01-01T0000.om'
		);
		expect(urls).toContain(fallbackUrl); // global fallback, current timestep

		// Only the /data_spatial/<domain>/ segment changes — host + run path + valid
		// time are preserved exactly as the seamless protocol requests them. (Prev/
		// next timesteps come from the live time store, so the date is not pinned.)
		for (const url of urls) {
			expect(url).toMatch(
				/^https:\/\/map-tiles\.open-meteo\.com\/data_spatial\/[^/]+\/\d{4}\/\d{2}\/\d{2}\/\d{4}Z\/.+\.om$/
			);
			expect(url).not.toContain('/ncep_gfs_seamless/');
		}
	});

	it('does not duplicate URLs', () => {
		const urls = getSeamlessWarmupOmUrls(gfsSeamless, fallbackUrl, undefined);
		expect(urls.length).toBe(new Set(urls).size);
	});
});
