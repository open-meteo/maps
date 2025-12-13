import { get } from 'svelte/store';

import * as maplibregl from 'maplibre-gl';
import { mode, setMode } from 'mode-watcher';

import { map as m } from '$lib/stores/map';
import {
	defaultPreferences,
	helpOpen as hO,
	preferences as p,
	sheet,
	url as u
} from '$lib/stores/preferences';

import {
	addHillshadeLayer,
	addHillshadeSources,
	addOmFileLayers,
	getStyle,
	terrainHandler,
	updateUrl
} from '$lib';

let url = get(u);
u.subscribe((newUrl) => {
	url = newUrl;
});

let map = get(m);
m.subscribe((newMap) => {
	map = newMap;
});

const preferences = get(p);

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

export const reloadStyles = () => {
	getStyle().then((style) => {
		map.setStyle(style);
		map.once('styledata', () => {
			setTimeout(() => {
				addOmFileLayers();
				addHillshadeSources();
				if (preferences.hillshade) {
					addHillshadeLayer();
				}
			}, 50);
		});
	});
};

export class DarkModeButton {
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
			reloadStyles();
		});
		return div;
	}
	onRemove() {}
}

export class TimeButton {
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

			updateUrl(
				'time_selector',
				String(preferences.timeSelector),
				String(defaultPreferences.timeSelector)
			);

			div.innerHTML = preferences.timeSelector ? clockSVG : calendarSVG;
		});
		return div;
	}
	onRemove() {}
}

let terrainControl: maplibregl.TerrainControl;
const addTerrainControl = () => {
	if (!map.hasControl(terrainControl)) {
		terrainControl = new maplibregl.TerrainControl({
			source: 'terrainSource',
			exaggeration: 1
		});

		map.addControl(terrainControl);

		terrainControl._terrainButton.addEventListener('click', () => terrainHandler());
	}
	if (preferences.terrain) {
		map.setTerrain({ source: 'terrainSource' });
	}
};
const removeTerrainControl = () => {
	if (map.hasControl(terrainControl)) {
		map.removeControl(terrainControl);
	}
	map.setTerrain(null);
};

export class HillshadeButton {
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
				addHillshadeLayer();
				addTerrainControl();
			}
		}, 100);

		div.addEventListener('contextmenu', (e) => e.preventDefault());
		div.addEventListener('click', () => {
			preferences.hillshade = !preferences.hillshade;
			p.set(preferences);
			if (preferences.hillshade) {
				div.innerHTML = hillshadeSVG;
				addHillshadeLayer();
				map.once('styledata', () => {
					setTimeout(() => {
						addTerrainControl();
					}, 50);
				});
			} else {
				div.innerHTML = noHillshadeSVG;
				map.once('styledata', () => {
					setTimeout(() => {
						removeTerrainControl();
					}, 50);
				});
			}
			updateUrl('hillshade', String(preferences.hillshade), String(defaultPreferences.hillshade));
		});
		return div;
	}
	onRemove() {}
}

export class HelpButton {
	onAdd() {
		const div = document.createElement('div');
		div.className = 'maplibregl-ctrl maplibregl-ctrl-group';
		div.title = 'Help';

		const helpSVG = `<button style="display:flex;justify-content:center;align-items:center;">
			<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" opacity="0.75" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-circle-question-mark-icon lucide-message-circle-question-mark"><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
			 </button>`;
		div.innerHTML = helpSVG;

		div.addEventListener('contextmenu', (e) => e.preventDefault());
		div.addEventListener('click', () => {
			const helpOpen = get(hO);
			hO.set(!helpOpen);
		});
		return div;
	}
	onRemove() {}
}
