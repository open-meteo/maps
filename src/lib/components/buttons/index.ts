import { get } from 'svelte/store';

import { setMode, mode } from 'mode-watcher';

import * as maplibregl from 'maplibre-gl';

import { pushState } from '$app/navigation';

import {
	sheet,
	preferences as p,
	paddedBoundsLayer,
	paddedBoundsSource
} from '$lib/stores/preferences';

import {
	getStyle,
	terrainHandler,
	addOmFileLayer,
	changeOMfileURL,
	getPaddedBounds,
	addHillshadeLayer,
	addHillshadeSources
} from '$lib';

import type { DomainMetaData } from '$lib/types';

const preferences = get(p);

let terrainControl: maplibregl.TerrainControl;

export class PartialButton {
	map;
	url;
	latest;
	constructor(map: maplibregl.Map, url: URL, latest: DomainMetaData | undefined) {
		this.map = map;
		this.url = url;
		this.latest = latest;
	}
	onAdd() {
		const div = document.createElement('div');
		div.className = 'maplibregl-ctrl maplibregl-ctrl-group';
		div.title = 'Partial requests';

		const partialSVG = `<button style="display:flex;justify-content:center;align-items:center;color:rgb(51,181,229);">
				<svg xmlns="http://www.w3.org/2000/svg" stroke-width="1.2" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-database-zap-icon lucide-database-zap"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 15 21.84"/><path d="M21 5V8"/><path d="M21 12L18 17H22L19 22"/><path d="M3 12A9 3 0 0 0 14.59 14.87"/></svg>
            </button>`;
		const fullSVG = `<button style="display:flex;justify-content:center;align-items:center;">
				<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" stroke-width="1.2" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-database-icon lucide-database"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>
       </button>`;
		div.innerHTML = preferences.partial ? partialSVG : fullSVG;
		div.addEventListener('contextmenu', (e) => e.preventDefault());
		div.addEventListener('click', () => {
			preferences.partial = !preferences.partial;
			p.set(preferences);
			div.innerHTML = preferences.partial ? partialSVG : fullSVG;
			if (preferences.partial) {
				this.url.searchParams.set('partial', String(preferences.partial));
				getPaddedBounds(this.map);
			} else {
				this.url.searchParams.delete('partial');
				this.map.removeLayer('paddedBoundsLayer');
				this.map.removeSource('paddedBoundsSource');
				paddedBoundsLayer.set(undefined);
				paddedBoundsSource.set(undefined);
			}
			pushState(this.url + this.map._hash.getHashString(), {});
			changeOMfileURL(this.map, this.url, this.latest);
		});
		return div;
	}
	onRemove() {}
}

export class SettingsButton {
	onAdd() {
		const div = document.createElement('div');
		div.title = 'Settings';
		div.className = 'maplibregl-ctrl maplibregl-ctrl-group';
		div.innerHTML = `<button style="display:flex;justify-content:center;align-items:center;">
				<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings-icon lucide-settings"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
       </button>`;
		div.addEventListener('contextmenu', (e) => e.preventDefault());
		div.addEventListener('click', () => {
			sheet.set(!get(sheet));
		});

		return div;
	}
	onRemove() {}
}

export class DarkModeButton {
	map;
	url;
	constructor(map: maplibregl.Map, url: URL) {
		this.map = map;
		this.url = url;
	}
	onAdd() {
		const div = document.createElement('div');
		div.title = 'Darkmode';

		div.className = 'maplibregl-ctrl maplibregl-ctrl-group';

		const darkSVG = `<button style="display:flex;justify-content:center;align-items:center;">
		<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" stroke-width="1.2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sun-icon lucide-sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
            </button>`;

		const lightSVG = `<button style="display:flex;justify-content:center;align-items:center;">
		<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" stroke-width="1.2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon-icon lucide-moon"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
       </button>`;
		div.innerHTML = mode.current !== 'dark' ? lightSVG : darkSVG;
		div.addEventListener('contextmenu', (e) => e.preventDefault());
		div.addEventListener('click', () => {
			if (mode.current === 'light') {
				setMode('dark');
			} else {
				setMode('light');
			}
			div.innerHTML = mode.current !== 'dark' ? lightSVG : darkSVG;
			getStyle().then((style) => {
				this.map.setStyle(style);
				this.map.once('styledata', () => {
					setTimeout(() => {
						addOmFileLayer(this.map);
						addHillshadeSources(this.map);
						if (preferences.hillshade) {
							addHillshadeLayer(this.map);
						}
					}, 50);
				});
			});
		});
		return div;
	}
	onRemove() {}
}

export class TimeButton {
	map;
	url;

	constructor(map: maplibregl.Map, url: URL) {
		this.map = map;
		this.url = url;
	}

	onAdd() {
		const div = document.createElement('div');
		div.className = 'maplibregl-ctrl maplibregl-ctrl-group';
		div.title = 'Time selector';

		const clockSVG = `<button style="display:flex;justify-content:center;align-items:center;color:rgb(51,181,229);">
				<svg xmlns="http://www.w3.org/2000/svg" opacity="1" stroke-width="1.2"  width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"  stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-clock-icon lucide-calendar-clock"><path d="M16 14v2.2l1.6 1"/><path d="M16 2v4"/><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M3 10h5"/><path d="M8 2v4"/><circle cx="16" cy="16" r="6"/></svg>
			 </button>`;
		const calendarSVG = `<button style="display:flex;justify-content:center;align-items:center;">
				<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" stroke-width="1.2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"  stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-off-icon lucide-calendar-off"><path d="M4.2 4.2A2 2 0 0 0 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 1.82-1.18"/><path d="M21 15.5V6a2 2 0 0 0-2-2H9.5"/><path d="M16 2v4"/><path d="M3 10h7"/><path d="M21 10h-5.5"/><path d="m2 2 20 20"/></svg>
			</button>`;

		if (preferences.timeSelector) {
			div.innerHTML = clockSVG;
		} else {
			div.innerHTML = calendarSVG;
		}
		div.addEventListener('contextmenu', (e) => e.preventDefault());
		div.addEventListener('click', () => {
			preferences.timeSelector = !preferences.timeSelector;
			p.set(preferences);
			if (preferences.timeSelector) {
				this.url.searchParams.delete('time-selector');
			} else {
				this.url.searchParams.set('time-selector', String(preferences.timeSelector));
			}
			pushState(this.url + this.map._hash.getHashString(), {});

			div.innerHTML = preferences.timeSelector ? clockSVG : calendarSVG;
		});
		return div;
	}
	onRemove() {}
}

export class HillshadeButton {
	map;
	url;

	constructor(map: maplibregl.Map, url: URL) {
		this.map = map;
		this.url = url;
	}

	addTerrainControl = () => {
		if (!this.map.hasControl(terrainControl)) {
			terrainControl = new maplibregl.TerrainControl({
				source: 'terrainSource',
				exaggeration: 1
			});

			this.map.addControl(terrainControl);

			terrainControl._terrainButton.addEventListener('click', () =>
				terrainHandler(this.map, this.url)
			);
		}
		if (preferences.terrain) {
			this.map.setTerrain({ source: 'terrainSource' });
		}
	};
	removeTerrainControl = () => {
		if (this.map.hasControl(terrainControl)) {
			this.map.removeControl(terrainControl);
		}
		this.map.setTerrain(null);
	};

	onAdd() {
		const div = document.createElement('div');
		div.className = 'maplibregl-ctrl maplibregl-ctrl-group';
		div.title = 'Hillshade';

		const noHillshadeSVG = `<button style="display:flex;justify-content:center;align-items:center;">
				<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" stroke-width="1.2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"  stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mountain-icon lucide-mountain"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>
			 </button>`;
		const hillshadeSVG = `<button style="display:flex;justify-content:center;align-items:center;color:rgb(51,181,229);">
				<svg xmlns="http://www.w3.org/2000/svg" opacity="1" stroke-width="1.2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mountain-snow-icon lucide-mountain-snow"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/><path d="M4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19"/></svg>
			</button>`;

		if (preferences.hillshade) {
			div.innerHTML = hillshadeSVG;
		} else {
			div.innerHTML = noHillshadeSVG;
		}

		setTimeout(() => {
			if (preferences.hillshade) {
				addHillshadeLayer(this.map);
				this.addTerrainControl();
			}
		}, 100);

		div.addEventListener('contextmenu', (e) => e.preventDefault());
		div.addEventListener('click', () => {
			preferences.hillshade = !preferences.hillshade;
			p.set(preferences);
			if (preferences.hillshade) {
				div.innerHTML = hillshadeSVG;
				this.url.searchParams.set('hillshade', String(preferences.hillshade));
				pushState(this.url + this.map._hash.getHashString(), {});
				addHillshadeLayer(this.map);

				this.map.once('styledata', () => {
					setTimeout(() => {
						this.addTerrainControl();
					}, 50);
				});
			} else {
				div.innerHTML = noHillshadeSVG;
				this.url.searchParams.delete('hillshade');
				pushState(this.url + this.map._hash.getHashString(), {});
				this.map.removeLayer('hillshadeLayer');

				this.map.once('styledata', () => {
					setTimeout(() => {
						this.removeTerrainControl();
					}, 50);
				});
			}
		});
		return div;
	}
	onRemove() {}
}
