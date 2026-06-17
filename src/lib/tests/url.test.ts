import { domainOptions, isSeamlessDomain } from '@openmeteo/weather-map-layer';
import { beforeEach, describe, expect, it } from 'vitest';

import { modelRun, time } from '$lib/stores/time';
import { getSeamlessWarmupOmUrls } from '$lib/url';

import type { SeamlessDomain } from '@openmeteo/weather-map-layer';

// A well-formed sub-layer URL: any host, a /data_spatial/<domain>/ segment, a
// model-run path (YYYY/MM/DD/HHmmZ) and a valid-time .om file.
const WELL_FORMED =
	/^https:\/\/[^/]+\/data_spatial\/[^/]+\/\d{4}\/\d{2}\/\d{2}\/\d{4}Z\/\d{4}-\d{2}-\d{2}T\d{4}\.om$/;

describe('getSeamlessWarmupOmUrls', () => {
	const gfsSeamless = domainOptions.find((d) => d.value === 'ncep_gfs_seamless') as SeamlessDomain;

	beforeEach(() => {
		// Deterministic current timestep + model run for URL construction.
		modelRun.set(new Date('2025-01-01T00:00:00Z'));
		time.set(new Date('2025-01-01T00:00:00Z'));
	});

	it('returns an empty list for a non-seamless domain', () => {
		const regular = domainOptions.find((d) => d.value === 'ncep_gfs025')!;
		expect(getSeamlessWarmupOmUrls(regular, undefined)).toEqual([]);
	});

	it('returns an empty list when no model run is selected', () => {
		modelRun.set(undefined);
		expect(getSeamlessWarmupOmUrls(gfsSeamless, undefined)).toEqual([]);
	});

	it('warms the current timestep for every concrete sub-layer', () => {
		const urls = getSeamlessWarmupOmUrls(gfsSeamless, undefined);
		// Including the regional HRRR the viewport gate may skip when loading data.
		expect(urls).toContain(
			'https://map-tiles.open-meteo.com/data_spatial/ncep_hrrr_conus/2025/01/01/0000Z/2025-01-01T0000.om'
		);
		expect(urls).toContain(
			'https://map-tiles.open-meteo.com/data_spatial/ncep_gfs025/2025/01/01/0000Z/2025-01-01T0000.om'
		);
	});

	it('produces well-formed URLs that never reference the composite itself', () => {
		for (const url of getSeamlessWarmupOmUrls(gfsSeamless, undefined)) {
			expect(url).toMatch(WELL_FORMED);
			expect(url).not.toContain('/ncep_gfs_seamless/');
		}
	});

	it('does not duplicate URLs', () => {
		const urls = getSeamlessWarmupOmUrls(gfsSeamless, undefined);
		expect(urls.length).toBe(new Set(urls).size);
	});

	// Guards that URL construction works for every sub-layer of every composite —
	// e.g. a mistyped/unknown domainValue would resolve to nothing and be missing.
	const seamlessDomains = domainOptions.filter(isSeamlessDomain) as SeamlessDomain[];
	it.each(seamlessDomains.map((d) => [d.value, d] as const))(
		'covers every sub-layer of %s with a well-formed URL',
		(_value, domain) => {
			const urls = getSeamlessWarmupOmUrls(domain, undefined);
			expect(urls.length).toBeGreaterThan(0);
			for (const url of urls) expect(url).toMatch(WELL_FORMED);
			for (const layer of domain.layers) {
				expect(
					urls.some((u) => u.includes(`/data_spatial/${layer.domainValue}/`)),
					`missing warm-up URL for sub-layer ${layer.domainValue}`
				).toBe(true);
			}
		}
	);
});
