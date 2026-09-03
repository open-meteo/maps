import { get } from 'svelte/store';

import { persisted } from 'svelte-persisted-store';
import { toast } from 'svelte-sonner';

import { browser } from '$app/environment';

import { BASE_URI, DATA_SPATIAL_BASE_URI, S3_BASE_URI } from '$lib/helpers';

/** Daily request allowance of the data API (server default, resets midnight UTC). */
export const DAILY_REQUEST_LIMIT = 10_000;

/** Hourly request allowance of the data API (resets at the top of each UTC hour). */
export const HOURLY_REQUEST_LIMIT = 5_000;

/** Minutely request allowance of the data API (resets every minute). */
export const MINUTELY_REQUEST_LIMIT = 600;

/** 429 responses in this session before switching to the S3 endpoint automatically. */
const AUTO_SWITCH_429_COUNT = 5;

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** The server clears rate-limit counters within the first minute of each window. */
const RESET_BUFFER_MS = 90_000;

/** UTC day the daily API limit resets on, e.g. '2026-09-02'. */
export const utcDay = (): string => new Date().toISOString().slice(0, 10);

/** UTC hour the hourly API limit resets on, e.g. '2026-09-02T13'. */
export const utcHour = (): string => new Date().toISOString().slice(0, 13);

/** UTC minute the minutely API limit resets on, e.g. '2026-09-02T13:05'. */
export const utcMinute = (): string => new Date().toISOString().slice(0, 16);

/** Requests issued against the data API, per rate-limit window (UTC). */
export const apiRequestCounter = persisted('api-request-counter', {
	day: utcDay(),
	count: 0,
	hour: utcHour(),
	hourCount: 0,
	minute: utcMinute(),
	minuteCount: 0
});

/**
 * Automatic fallback: while `activeUntil` (epoch ms) is in the future, data
 * requests are rewritten to the uncached S3 origin (no rate limit, slower)
 * and revert when the tripped rate-limit window resets.
 */
export const s3Fallback = persisted('api-s3-fallback', { activeUntil: 0 });

const s3FallbackActive = (): boolean => get(s3Fallback).activeUntil > Date.now();

/** Rate-limit handling toggles from the settings panel. */
export const rateLimitOptions = persisted('api-rate-limit-options', {
	/** Switch to the S3 endpoint automatically after repeated 429s. */
	autoSwitch: true,
	/** Toasts about reached limits and endpoint switches. */
	notifications: true
});

const notify = (show: () => void): void => {
	if (get(rateLimitOptions).notifications) show();
};

export type EndpointMode = 'default' | 'data-spatial' | 's3' | 'custom';

/** Manual endpoint choice from the settings panel; `custom` uses `customUri`. */
export const endpointChoice = persisted('api-endpoint-choice', {
	mode: 'default' as EndpointMode,
	customUri: ''
});

/** Base URI data requests are rewritten to, or undefined to leave them on BASE_URI. */
const rewriteBase = (): string | undefined => {
	const choice = get(endpointChoice);
	let target: string | undefined;
	if (choice.mode === 'custom') {
		const uri = choice.customUri.trim().replace(/\/+$/, '');
		if (uri) target = uri;
	} else if (choice.mode === 's3') {
		target = S3_BASE_URI;
	} else if (choice.mode === 'data-spatial') {
		target = DATA_SPATIAL_BASE_URI;
	}
	// The automatic fallback applies whenever the effective endpoint is the
	// rate-limited one, whether via BASE_URI or picked explicitly.
	if ((target ?? BASE_URI) === DATA_SPATIAL_BASE_URI && s3FallbackActive()) {
		target = S3_BASE_URI;
	}
	return target === BASE_URI ? undefined : target;
};

/** Manual mode selection; also ends an automatic S3 period. */
export const setEndpointMode = (mode: EndpointMode): void => {
	clearTimeout(switchBackTimer);
	s3Fallback.set({ activeUntil: 0 });
	endpointChoice.update((choice) => ({ ...choice, mode }));
};

/** Epoch ms just after the current minutely/hourly/daily rate-limit window resets. */
const nextReset = (periodMs: number): number =>
	(Math.floor(Date.now() / periodMs) + 1) * periodMs + RESET_BUFFER_MS;

let switchBackTimer: ReturnType<typeof setTimeout> | undefined;

const scheduleSwitchBack = (): void => {
	const remaining = get(s3Fallback).activeUntil - Date.now();
	if (remaining <= 0) return;
	clearTimeout(switchBackTimer);
	switchBackTimer = setTimeout(() => {
		s3Fallback.set({ activeUntil: 0 });
		notify(() => toast.info('API rate limit reset, switched back to the fast endpoint'));
	}, remaining);
};

const activateS3Fallback = (until: number): void => {
	status429Count = 0;
	s3Fallback.set({ activeUntil: until });
	scheduleSwitchBack();
};

let limitToastDay = '';

/** The local counter hit the daily limit: offer the switch, but let the user decide. */
const onLimitReached = (): void => {
	if (limitToastDay === utcDay() || s3FallbackActive()) return;
	if (!get(rateLimitOptions).notifications) return;
	limitToastDay = utcDay();
	// Neutral toast(): the richColors warning variant clashes with the app style.
	toast('Daily API request limit reached', {
		description: 'New requests are likely to be rejected until midnight UTC.',
		duration: Number.POSITIVE_INFINITY,
		action: {
			label: 'Use slower endpoint',
			onClick: () => {
				activateS3Fallback(nextReset(DAY_MS));
				toast.info('Switched to the slower S3 endpoint until midnight UTC');
			}
		}
	});
};

let status429Count = 0;

/** Actual 429 responses are a hard signal: switch automatically after a few. */
const on429 = async (res: Response): Promise<void> => {
	if (s3FallbackActive()) return;
	status429Count += 1;
	if (status429Count !== AUTO_SWITCH_429_COUNT) return;
	// The 429 body names the minutely/hourly/daily window that tripped
	// (RateLimitError in open-meteo), and thus when it resets.
	let period = HOUR_MS;
	let label = 'hourly';
	try {
		const reason: string = (await res.clone().json())?.reason ?? '';
		if (/daily/i.test(reason)) [period, label] = [DAY_MS, 'daily'];
		else if (/minutely/i.test(reason)) [period, label] = [MINUTE_MS, 'minutely'];
	} catch {
		// Keep the hourly middle ground if the body is not readable.
	}
	if (get(rateLimitOptions).autoSwitch) {
		activateS3Fallback(nextReset(period));
		notify(() =>
			toast('API rate limit exceeded', {
				description: `Switched to the slower S3 endpoint until the ${label} limit resets.`
			})
		);
	} else {
		// Auto switch disabled: offer the switch instead of performing it.
		notify(() =>
			toast('API rate limit exceeded', {
				description: 'Requests are being rejected until the limit resets.',
				duration: Number.POSITIVE_INFINITY,
				action: {
					label: 'Use slower endpoint',
					onClick: () => activateS3Fallback(nextReset(period))
				}
			})
		);
	}
};

const increment = (): void => {
	const day = utcDay();
	const hour = utcHour();
	const minute = utcMinute();
	apiRequestCounter.update((counter) => ({
		day,
		count: counter.day === day ? counter.count + 1 : 1,
		hour,
		hourCount: counter.hour === hour ? counter.hourCount + 1 : 1,
		minute,
		minuteCount: counter.minute === minute ? counter.minuteCount + 1 : 1
	}));
	if (get(apiRequestCounter).count >= DAILY_REQUEST_LIMIT) onLimitReached();
};

let installed = false;

/**
 * Count every HTTP request to the data API by wrapping `window.fetch`.
 * All data traffic (block cache misses, HEAD metadata probes, meta JSONs)
 * goes through main-thread fetch, so one wrapper sees it all. While an S3 or
 * custom endpoint override is active, requests are rewritten here at the
 * network layer: URL strings elsewhere (cache keys, UI) keep the canonical
 * endpoint.
 */
export const installRequestCounter = (): void => {
	if (!browser || installed) return;
	installed = true;
	scheduleSwitchBack();
	const originalFetch = window.fetch;
	window.fetch = (input, init) => {
		let url = '';
		try {
			url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		} catch {
			// Counting must never break a request.
		}
		if (!url.startsWith(BASE_URI)) return originalFetch.call(window, input, init);
		const base = rewriteBase();
		const targetUrl = base ? base + url.slice(BASE_URI.length) : url;
		// Only requests that end up on the rate-limited endpoint count.
		const limited = targetUrl.startsWith(DATA_SPATIAL_BASE_URI);
		if (limited) increment();
		const targetInput = !base
			? input
			: typeof input === 'string' || input instanceof URL
				? targetUrl
				: new Request(targetUrl, input);
		const response = originalFetch.call(window, targetInput, init);
		if (limited) {
			response
				.then((res) => {
					if (res.status === 429) on429(res);
				})
				.catch(() => {});
		}
		return response;
	};
};
