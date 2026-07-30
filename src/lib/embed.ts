// Bridge for embedders: when the map runs inside an iframe, the parent window
// can steer it with { type: 'om-maps:set', domain?, theme? } messages, and the
// position hash is mirrored back so the embedder can reflect it in its own URL.
import { get } from 'svelte/store';

import { domainOptions } from '@openmeteo/weather-map-layer';
import { setMode } from 'mode-watcher';

import { browser, version } from '$app/environment';

import { map as m } from '$lib/stores/map';
import { domain } from '$lib/stores/variables';

import { getAppliedStyleMode, reloadStyles } from '$lib/map-controls';

import type { DarkModeButton } from '$lib/components/buttons';

// Domains this build can actually render. Seamless composites are excluded
// until the app supports them; drop the filter once they work and embedders
// will pick them up automatically through the ready handshake.
const supportedDomainValues = new Set(
	domainOptions
		.filter((domainOption) => !('type' in domainOption && domainOption.type === 'seamless'))
		.map(({ value }) => value)
);

const isEmbedded = () => window.parent !== window;

let darkModeButton: DarkModeButton | undefined;

// Any origin may send this; the payload is validated and each field has the
// same effect as the matching UI interaction.
const onEmbedderMessage = (event: MessageEvent) => {
	const {
		type,
		domain: requestedDomain,
		theme: requestedTheme
	} = (event.data ?? {}) as {
		type?: string;
		domain?: string;
		theme?: string;
	};
	if (type !== 'om-maps:set') return;
	if (
		requestedDomain &&
		supportedDomainValues.has(requestedDomain) &&
		get(domain) !== requestedDomain
	) {
		domain.set(requestedDomain);
	}
	if (requestedTheme === 'light' || requestedTheme === 'dark' || requestedTheme === 'system') {
		// resolve 'system' ourselves instead of relying on mode.current
		// updating synchronously after setMode
		const resolved =
			requestedTheme === 'system'
				? window.matchMedia('(prefers-color-scheme: dark)').matches
					? 'dark'
					: 'light'
				: requestedTheme;
		setMode(requestedTheme);
		darkModeButton?.refresh();
		// Compare against the style that is actually loaded, not
		// mode.current: the embedder's color-scheme propagates into our
		// prefers-color-scheme, so the UI mode may have flipped already
		// while the basemap style never reloaded.
		if (resolved !== getAppliedStyleMode()) {
			reloadStyles();
		}
	}
};

// Mirrors the position hash to the parent window and starts listening for
// om-maps:set messages. Call after the map has been created.
export const startEmbedderBridge = (button: DarkModeButton) => {
	if (!isEmbedded()) return;
	darkModeButton = button;

	const postHashToParent = () => {
		window.parent.postMessage({ type: 'om-maps:hash', hash: window.location.hash }, '*');
	};
	// maplibre's own hash handler runs on moveend first, so location.hash is
	// already up to date when this fires
	get(m)?.on('moveend', postHashToParent);
	postHashToParent();

	window.addEventListener('message', onEmbedderMessage);
};

// Handshake for embedders: advertise what this build supports so a parent can
// translate its own model ids and knows the map is now listening for
// om-maps:set (posting earlier would race startup). The payload is harmless,
// so any parent origin may receive it. Call once the map has loaded.
export const postEmbedderReady = () => {
	if (!isEmbedded()) return;
	window.parent.postMessage(
		{ type: 'om-maps:ready', version, domains: [...supportedDomainValues] },
		'*'
	);
};

export const stopEmbedderBridge = () => {
	// also runs after server-side rendering, where window is absent
	if (!browser) return;
	window.removeEventListener('message', onEmbedderMessage);
};
