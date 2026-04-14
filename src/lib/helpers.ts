import { browser } from '$app/environment';

/**
 * Pads a number with leading zeros to ensure 2 digits
 */
export const pad = (num: number | string): string => String(num).padStart(2, '0');

export const fmtModelRun = (modelRun: Date): string =>
	`${modelRun.getUTCFullYear()}/${pad(modelRun.getUTCMonth() + 1)}/${pad(modelRun.getUTCDate())}/${pad(modelRun.getUTCHours())}${pad(modelRun.getUTCMinutes())}Z`;

export const fmtSelectedTime = (t: Date): string =>
	`${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}`;

export const getBaseUri = (domainValue: string): string =>
	domainValue.startsWith('dwd_icon') && !domainValue.endsWith('eps')
		? 'https://s3.servert.ch'
		: 'https://map-tiles.open-meteo.com';

export const hashValue = (val: string): Promise<string> =>
	crypto.subtle.digest('SHA-256', new TextEncoder().encode(val)).then((h) => {
		const view = new DataView(h);
		const hexes: string[] = [];
		for (let i = 0; i < view.byteLength; i += 4)
			hexes.push(('00000000' + view.getUint32(i).toString(16)).slice(-8));
		return hexes.join('');
	});

export const throttle = <T extends unknown[]>(
	callback: (...args: T) => void,
	delay: number
): ((...args: T) => void) => {
	let waiting = false;
	return (...args: T) => {
		if (waiting) return;
		callback(...args);
		waiting = true;
		setTimeout(() => {
			waiting = false;
		}, delay);
	};
};

function isHighDensity(): boolean {
	return (
		window.matchMedia?.(
			'only screen and (min-resolution: 124dpi), only screen and (min-resolution: 1.3dppx), only screen and (min-resolution: 48.8dpcm)'
		).matches ||
		window.matchMedia?.(
			'only screen and (-webkit-min-device-pixel-ratio: 1.3), only screen and (-o-min-device-pixel-ratio: 2.6/2), only screen and (min--moz-device-pixel-ratio: 1.3), only screen and (min-device-pixel-ratio: 1.3)'
		).matches ||
		window.devicePixelRatio > 1.3
	);
}

function isRetina(): boolean {
	return (
		(window.matchMedia?.(
			'only screen and (min-resolution: 192dpi), only screen and (min-resolution: 2dppx), only screen and (min-resolution: 75.6dpcm)'
		).matches ||
			window.matchMedia?.(
				'only screen and (-webkit-min-device-pixel-ratio: 2), only screen and (-o-min-device-pixel-ratio: 2/1), only screen and (min--moz-device-pixel-ratio: 2), only screen and (min-device-pixel-ratio: 2)'
			).matches ||
			window.devicePixelRatio >= 2) &&
		/(iPad|iPhone|iPod)/g.test(navigator.userAgent)
	);
}

export const checkHighDefinition = (): boolean => (browser ? isRetina() || isHighDensity() : false);

export const textWhite = (
	[r, g, b, a]: [number, number, number, number] | [number, number, number],
	dark?: boolean,
	globalOpacity?: number
): boolean => {
	const alpha = ((a ?? 1) * (globalOpacity ?? 100)) / 100;
	if (alpha < 0.65) return dark ?? false;
	return r * 0.299 + g * 0.587 + b * 0.114 <= 150;
};
