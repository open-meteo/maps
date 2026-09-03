import { get } from 'svelte/store';

import { persisted } from 'svelte-persisted-store';
import { toast } from 'svelte-sonner';

import { browser } from '$app/environment';

import { BASE_URI, SLOW_BASE_URI } from '$lib/helpers';

/** Daily request allowance of the data API. */
export const DAILY_REQUEST_LIMIT = 10_000;

/** 429 responses in this session before switching to the S3 endpoint automatically. */
const AUTO_SWITCH_429_COUNT = 5;

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** The server clears rate-limit counters within the first minute of each window. */
const RESET_BUFFER_MS = 90_000;

/** UTC day the API limit resets on, e.g. '2026-09-02'. */
export const utcDay = (): string => new Date().toISOString().slice(0, 10);

/** Requests issued against the data API, per UTC day. */
export const apiRequestCounter = persisted('api-request-counter', {
	day: utcDay(),
	count: 0
});

/**
 * Automatic fallback: while `activeUntil` (epoch ms) is in the future, data
 * requests are rewritten to the uncached S3 origin (no rate limit, slower)
 * and revert when the tripped rate-limit window resets.
 */
export const slowEndpoint = persisted('api-slow-endpoint', { activeUntil: 0 });

export type EndpointMode = 'fast' | 'slow' | 'custom';

/** Manual endpoint choice from the settings panel; `custom` uses `customUri`. */
export const endpointChoice = persisted('api-endpoint-choice', {
	mode: 'fast' as EndpointMode,
	customUri: ''
});

/** Base URI data requests are rewritten to, or undefined for the fast default. */
const rewriteBase = (): string | undefined => {
	const choice = get(endpointChoice);
	if (choice.mode === 'custom') {
		const uri = choice.customUri.trim().replace(/\/+$/, '');
		if (uri) return uri;
	} else if (choice.mode === 'slow') {
		return SLOW_BASE_URI;
	}
	return get(slowEndpoint).activeUntil > Date.now() ? SLOW_BASE_URI : undefined;
};

/** Manual mode selection; also ends an automatic S3 period. */
export const setEndpointMode = (mode: EndpointMode): void => {
	clearTimeout(switchBackTimer);
	slowEndpoint.set({ activeUntil: 0 });
	endpointChoice.update((choice) => ({ ...choice, mode }));
};

/** Epoch ms just after the current minutely/hourly/daily rate-limit window resets. */
const nextReset = (periodMs: number): number =>
	(Math.floor(Date.now() / periodMs) + 1) * periodMs + RESET_BUFFER_MS;

let switchBackTimer: ReturnType<typeof setTimeout> | undefined;

const scheduleSwitchBack = (): void => {
	const remaining = get(slowEndpoint).activeUntil - Date.now();
	if (remaining <= 0) return;
	clearTimeout(switchBackTimer);
	switchBackTimer = setTimeout(() => {
		slowEndpoint.set({ activeUntil: 0 });
		toast.info('API rate limit reset, switched back to the fast endpoint');
	}, remaining);
};

const activateSlowEndpoint = (until: number): void => {
	status429Count = 0;
	slowEndpoint.set({ activeUntil: until });
	scheduleSwitchBack();
};

let limitToastDay = '';

/** The local counter hit the daily limit: offer the switch, but let the user decide. */
const onLimitReached = (): void => {
	if (limitToastDay === utcDay() || rewriteBase()) return;
	limitToastDay = utcDay();
	// Neutral toast(): the richColors warning variant clashes with the app style.
	toast('Daily API request limit reached', {
		description: 'New requests are likely to be rejected until midnight UTC.',
		duration: Number.POSITIVE_INFINITY,
		action: {
			label: 'Use slower endpoint',
			onClick: () => {
				activateSlowEndpoint(nextReset(DAY_MS));
				toast.info('Switched to the slower S3 endpoint until midnight UTC');
			}
		}
	});
};

let status429Count = 0;

/** Actual 429 responses are a hard signal: switch automatically after a few. */
const on429 = async (res: Response): Promise<void> => {
	if (rewriteBase()) return;
	status429Count += 1;
	if (status429Count < AUTO_SWITCH_429_COUNT) return;
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
	activateSlowEndpoint(nextReset(period));
	toast('API rate limit exceeded', {
		description: `Switched to the slower S3 endpoint until the ${label} limit resets.`
	});
};

const increment = (): void => {
	const day = utcDay();
	apiRequestCounter.update((counter) =>
		counter.day === day ? { day, count: counter.count + 1 } : { day, count: 1 }
	);
	if (get(apiRequestCounter).count >= DAILY_REQUEST_LIMIT) onLimitReached();
};

let installed = false;

/**
 * Count every HTTP request to the data API by wrapping `window.fetch`.
 * All data traffic (block cache misses, HEAD metadata probes, meta JSONs)
 * goes through main-thread fetch, so one wrapper sees it all. While the slow
 * endpoint is active, requests are rewritten here at the network layer: URL
 * strings elsewhere (cache keys, UI) keep the canonical endpoint.
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
		if (base) {
			const rewritten = base + url.slice(BASE_URI.length);
			const rewrittenInput =
				typeof input === 'string' || input instanceof URL
					? rewritten
					: new Request(rewritten, input);
			return originalFetch.call(window, rewrittenInput, init);
		}
		increment();
		const response = originalFetch.call(window, input, init);
		response
			.then((res) => {
				if (res.status === 429) on429(res);
			})
			.catch(() => {});
		return response;
	};
};
