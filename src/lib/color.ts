export interface RGB {
	r: number;
	g: number;
	b: number;
}

export interface HSV {
	h: number;
	s: number;
	v: number;
}

export type RGBA = [number, number, number, number];

export function hexToRgb(hex: string): RGB | null {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex);
	return result
		? {
				r: parseInt(result[1], 16),
				g: parseInt(result[2], 16),
				b: parseInt(result[3], 16)
			}
		: null;
}

export function rgbToHex(r: number, g: number, b: number): string {
	return `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
}

export function rgbToHsv(r: number, g: number, b: number): HSV {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	let h = 0;
	const s = max === 0 ? 0 : (d / max) * 100;
	const v = max * 100;

	if (d !== 0) {
		switch (max) {
			case r:
				h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
				break;
			case g:
				h = ((b - r) / d + 2) * 60;
				break;
			case b:
				h = ((r - g) / d + 4) * 60;
				break;
		}
	}
	return { h, s, v };
}

export function hsvToRgb(h: number, s: number, v: number): RGB {
	s /= 100;
	v /= 100;
	const c = v * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = v - c;
	let r = 0,
		g = 0,
		b = 0;

	if (h < 60) {
		r = c;
		g = x;
	} else if (h < 120) {
		r = x;
		g = c;
	} else if (h < 180) {
		g = c;
		b = x;
	} else if (h < 240) {
		g = x;
		b = c;
	} else if (h < 300) {
		r = x;
		b = c;
	} else {
		r = c;
		b = x;
	}

	return {
		r: (r + m) * 255,
		g: (g + m) * 255,
		b: (b + m) * 255
	};
}

export function rgbaToHex(rgba: number[]): string {
	const [r, g, b] = rgba;
	return rgbToHex(r, g, b);
}

export function hexToRgba(hex: string, alpha: number): RGBA {
	const rgb = hexToRgb(hex);
	if (!rgb) return [0, 0, 0, alpha];
	return [rgb.r, rgb.g, rgb.b, alpha];
}

export function getAlpha(rgba: number[]): number {
	return rgba[3] ?? 1;
}

export function alphaToPercent(alpha: number): number {
	return Math.round(alpha * 100);
}

export function percentToAlpha(percent: number): number {
	return Math.round(percent / 100);
}

export function isValidHex(hex: string): boolean {
	return /^#[0-9A-Fa-f]{6}$/.test(hex);
}
