import { describe, expect, it } from 'vitest';

import { ARCHIVE_DOMAINS, archiveDomain, archiveIndexUrl, forecastHour } from '#lib/archive.js';
import { dataFileQuery, dataFileUrl } from '#lib/data-url.js';
import { BASE_URI } from '#lib/helpers.js';

const gfs025 = archiveDomain('ncep_gfs025_archive')!;
const gfs013 = archiveDomain('ncep_gfs013_archive')!;

describe('archiveIndexUrl', () => {
	it('names the pressure product inside the atmos directory of a recent cycle', () => {
		expect(archiveIndexUrl(gfs025, new Date('2026-10-27T00:00:00Z'), 3)).toBe(
			'https://noaa-gfs-bdp-pds.s3.amazonaws.com/gfs.20261027/00/atmos/gfs.t00z.pgrb2.0p25.f003.idx'
		);
	});

	it('names the surface flux product with its grib2 suffix', () => {
		expect(archiveIndexUrl(gfs013, new Date('2026-10-27T18:00:00Z'), 120)).toBe(
			'https://noaa-gfs-bdp-pds.s3.amazonaws.com/gfs.20261027/18/atmos/gfs.t18z.sfluxgrbf120.grib2.idx'
		);
	});

	it('leaves out the atmos directory for cycles before GFS v16', () => {
		expect(archiveIndexUrl(gfs025, new Date('2021-03-22T06:00:00Z'), 0)).toBe(
			'https://noaa-gfs-bdp-pds.s3.amazonaws.com/gfs.20210322/06/gfs.t06z.pgrb2.0p25.f000.idx'
		);
		expect(archiveIndexUrl(gfs025, new Date('2021-03-22T12:00:00Z'), 0)).toContain('/12/atmos/');
	});
});

describe('forecastHour', () => {
	it('is the lead time in whole hours', () => {
		const run = new Date('2026-10-27T00:00:00Z');
		expect(forecastHour(run, new Date('2026-10-27T00:00:00Z'))).toBe(0);
		expect(forecastHour(run, new Date('2026-11-12T00:00:00Z'))).toBe(384);
	});
});

describe('dataFileUrl', () => {
	const run = new Date('2026-10-27T06:00:00Z');
	const time = new Date('2026-10-28T09:00:00Z');

	it('is the data server file for a served domain, with the plain query start', () => {
		expect(dataFileUrl('dwd_icon', run, time)).toBe(
			`${BASE_URI}/dwd_icon/2026/10/27/0600Z/2026-10-28T0900.om`
		);
		expect(dataFileQuery('dwd_icon')).toBe('?');
	});

	it('is the inventory of the archived step for an archive domain, which names its domain', () => {
		expect(dataFileUrl('ncep_gfs025_archive', run, time)).toBe(archiveIndexUrl(gfs025, run, 27));
		expect(dataFileQuery('ncep_gfs025_archive')).toBe('?domain=ncep_gfs025_archive&');
	});
});

describe('ARCHIVE_DOMAINS', () => {
	it('run on the grids of the served GFS domains', () => {
		expect(ARCHIVE_DOMAINS.map(({ grid }) => grid.nx)).toEqual([1440, 3072]);
	});
});
