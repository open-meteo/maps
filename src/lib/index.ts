import { get } from 'svelte/store';

import { SvelteDate } from 'svelte/reactivity';

import { toast } from 'svelte-sonner';

import * as maplibregl from 'maplibre-gl';

import { pushState } from '$app/navigation';

import { pad } from '$lib/utils/pad';

import { preferences as p, time, model, domain, variables } from '$lib/stores/preferences';

import { domainOptions } from '$lib/utils/domains';
import { variableOptions } from '$lib/utils/variables';

import type { DomainMetaData } from './types';

const preferences = get(p);

const now = new SvelteDate();
now.setHours(now.getHours() + 1, 0, 0, 0);

export const urlParamsToPreferences = (url: URL) => {
	const params = new URLSearchParams(url.search);

	const urlModelTime = params.get('model_run');
	if (urlModelTime && urlModelTime.length == 15) {
		const year = parseInt(urlModelTime.slice(0, 4));
		const month = parseInt(urlModelTime.slice(5, 7)) - 1;
		const day = parseInt(urlModelTime.slice(8, 10));
		const hour = parseInt(urlModelTime.slice(11, 13));
		const minute = parseInt(urlModelTime.slice(13, 15));
		// Parse Date from UTC components (urlTime is in UTC)
		model.set(new SvelteDate(Date.UTC(year, month, day, hour, minute, 0, 0)));
	} else {
		const m = get(model);
		m.setHours(0, 0, 0, 0);
		model.set(m);
	}

	const urlTime = params.get('time');
	if (urlTime && urlTime.length == 15) {
		const year = parseInt(urlTime.slice(0, 4));
		const month = parseInt(urlTime.slice(5, 7)) - 1;
		const day = parseInt(urlTime.slice(8, 10));
		const hour = parseInt(urlTime.slice(11, 13));
		const minute = parseInt(urlTime.slice(13, 15));
		// Parse Date from UTC components (urlTime is in UTC)
		time.set(new SvelteDate(Date.UTC(year, month, day, hour, minute, 0, 0)));
	}
	checkClosestHourDomainInterval(url);

	if (params.get('globe')) {
		preferences.globe = params.get('globe') === 'true';
	} else {
		if (preferences.globe) {
			url.searchParams.set('globe', String(preferences.globe));
		}
	}

	if (params.get('partial')) {
		preferences.partial = params.get('partial') === 'true';
	} else {
		if (preferences.partial) {
			url.searchParams.set('partial', String(preferences.partial));
		}
	}

	if (params.get('terrain')) {
		preferences.terrain = params.get('terrain') === 'true';
	} else {
		if (preferences.terrain) {
			url.searchParams.set('terrain', String(preferences.terrain));
		}
	}

	if (params.get('domain')) {
		domain.set(domainOptions.find((dm) => dm.value === params.get('domain')) ?? domainOptions[0]);
	}

	if (params.get('variables')) {
		variables.set([
			variableOptions.find((v) => v.value === params.get('variables')) ?? variableOptions[0]
		]);
	}

	if (params.get('hillshade')) {
		preferences.hillshade = params.get('hillshade') === 'true';
	} else {
		if (preferences.hillshade) {
			url.searchParams.set('hillshade', String(preferences.hillshade));
		}
	}

	if (params.get('time-selector')) {
		preferences.timeSelector = params.get('time-selector') === 'true';
	} else {
		if (preferences.timeSelector) {
			url.searchParams.set('time-selector', String(preferences.timeSelector));
		}
	}

	p.set(preferences);
};

export const checkClosestHourDomainInterval = (url: URL) => {
	const t = get(time);
	const d = get(domain);
	if (d.time_interval > 1) {
		if (t.getUTCHours() % d.time_interval > 0) {
			const closestUTCHour = t.getUTCHours() - (t.getUTCHours() % d.time_interval);
			t.setUTCHours(closestUTCHour + d.time_interval);
			url.searchParams.set('time', t.toISOString().replace(/[:Z]/g, '').slice(0, 15));
		}
	}
	time.set(t);
};

export const checkClosestHourModelRun = (
	map: maplibregl.Map,
	latest: DomainMetaData | undefined,
	url: URL
) => {
	const t = get(time);
	const m = get(model);
	const d = get(domain);

	let modelRunChanged = false;
	const referenceTime = new Date(latest ? latest.reference_time : now);

	const year = t.getUTCFullYear();
	const month = t.getUTCMonth();
	const date = t.getUTCDate();

	const closestModelRunUTCHour = t.getUTCHours() - (t.getUTCHours() % d.model_interval);

	const closestModelRun = new SvelteDate();
	closestModelRun.setUTCFullYear(year);
	closestModelRun.setUTCMonth(month);
	closestModelRun.setUTCDate(date);
	closestModelRun.setUTCHours(closestModelRunUTCHour);
	closestModelRun.setUTCMinutes(0);
	closestModelRun.setUTCSeconds(0);
	closestModelRun.setUTCMilliseconds(0);

	if (t.getTime() < m.getTime()) {
		model.set(new SvelteDate(closestModelRun));
		modelRunChanged = true;
	} else {
		if (referenceTime.getTime() === m.getTime()) {
			url.searchParams.delete('model_run');
			pushState(url + map._hash.getHashString(), {});
		} else if (t.getTime() > referenceTime.getTime() && referenceTime.getTime() > m.getTime()) {
			model.set(new SvelteDate(referenceTime));
			modelRunChanged = true;
		} else if (t.getTime() < referenceTime.getTime() - 24 * 60 * 60 * 1000) {
			// Atleast yesterday, always update to nearest modelRun
			if (m.getTime() < closestModelRun.getTime()) {
				model.set(new SvelteDate(closestModelRun));
				modelRunChanged = true;
			}
		}
	}

	if (modelRunChanged) {
		url.searchParams.set('model_run', m.toISOString().replace(/[:Z]/g, '').slice(0, 15));
		pushState(url + map._hash.getHashString(), {});
		toast(
			'Model run set to: ' +
				m.getUTCFullYear() +
				'-' +
				pad(m.getUTCMonth() + 1) +
				'-' +
				pad(m.getUTCDate()) +
				' ' +
				pad(m.getUTCHours()) +
				':' +
				pad(m.getUTCMinutes())
		);
	}
	// day the data structure was altered
	if (m.getTime() < 1752624000000) {
		toast('Date selected probably too old, since data structure altered on 16th July 2025');
	}
};

export const setMapControlSettings = (map: maplibregl.Map, url: URL) => {
	map.touchZoomRotate.disableRotation();

	const navigationControl = new maplibregl.NavigationControl({
		visualizePitch: true,
		showZoom: true,
		showCompass: true
	});
	map.addControl(navigationControl);

	const locateControl = new maplibregl.GeolocateControl({
		fitBoundsOptions: {
			maxZoom: 13.5
		},
		positionOptions: {
			enableHighAccuracy: true
		},
		trackUserLocation: true
	});
	map.addControl(locateControl);

	const globeControl = new maplibregl.GlobeControl();
	map.addControl(globeControl);
	globeControl._globeButton.addEventListener('click', () => {
		preferences.globe = !preferences.globe;
		p.set(preferences);
		if (preferences.globe) {
			url.searchParams.set('globe', String(preferences.globe));
		} else {
			url.searchParams.delete('globe');
		}
		pushState(url + map._hash.getHashString(), {});
	});

	// improved scrolling
	map.scrollZoom.setZoomRate(1 / 85);
	map.scrollZoom.setWheelZoomRate(1 / 85);
};
