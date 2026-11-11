/**
 * The domains this app offers: the library's catalogue, which the data
 * server serves, plus the GFS archive entries read straight from NOAA's
 * bucket. Both the UI and the om protocol work from this one list, so an
 * archive entry resolves like any other domain.
 */
import { type Domain, domainOptions as servedDomainOptions } from '@openmeteo/weather-map-layer';

import { ARCHIVE_DOMAINS } from './archive';

export const domainOptions: Domain[] = [...servedDomainOptions, ...ARCHIVE_DOMAINS];
