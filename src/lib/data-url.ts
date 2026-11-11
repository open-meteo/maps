import { archiveDomain, archiveIndexUrl, forecastHour } from './archive';
import { BASE_URI, fmtModelRun, fmtSelectedTime } from './helpers';

/**
 * The file holding `domain`'s data for one time step of a run: the data
 * server's `.om` file, or for an archive domain the `.idx` inventory of the
 * GRIB file in NOAA's bucket. Without query parameters.
 */
export const dataFileUrl = (domain: string, modelRun: Date, time: Date): string => {
	const archive = archiveDomain(domain);
	if (archive) return archiveIndexUrl(archive, modelRun, forecastHour(modelRun, time));
	return `${BASE_URI}/${domain}/${fmtModelRun(modelRun)}/${fmtSelectedTime(time)}.om`;
};

/**
 * The query the om protocol needs before the variable: an archive file's
 * path has no domain segment, so the domain is named explicitly.
 */
export const dataFileQuery = (domain: string): string =>
	archiveDomain(domain) ? `?domain=${domain}&` : '?';
