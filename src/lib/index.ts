import { get } from 'svelte/store';

import { preferences as p, time, model, domain, variables } from '$lib/stores/preferences';

import { domainOptions } from '$lib/utils/domains';
import { variableOptions } from '$lib/utils/variables';
import { SvelteDate } from 'svelte/reactivity';

const preferences = get(p);

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
	checkClosestHourDomainInterval();

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
	const d = get(domain);
	const t = get(time);
	if (d.time_interval > 1) {
		if (t.getUTCHours() % d.time_interval > 0) {
			const closestUTCHour = t.getUTCHours() - (t.getUTCHours() % d.time_interval);
			t.setUTCHours(closestUTCHour + d.time_interval);
			url.searchParams.set('time', t.toISOString().replace(/[:Z]/g, '').slice(0, 15));
		}
	}
	time.set(t);
};
