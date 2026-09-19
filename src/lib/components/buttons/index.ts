import { get } from 'svelte/store';

import { setMode, userPrefersMode } from 'mode-watcher';

import { clippingPanelOpen } from '$lib/stores/clipping';
import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
import {
	defaultPreferences,
	helpOpen as hO,
	preferences as p,
	sheet
} from '$lib/stores/preferences';

import { reanchorRasterLayers } from '$lib/layers';
import { addHillshadeLayer, globeHandler, terrainHandler } from '$lib/map-controls';
import { updateUrl } from '$lib/url';

import type * as mapboxgl from 'mapbox-gl';

const preferences = get(p);

export class SettingsButton {
	onAdd() {
		const div = document.createElement('div');
		div.title = 'Settings';
		div.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
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

const sunSVG = `<button style="display:flex;justify-content:center;align-items:center;">
		<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" stroke-width="1.2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sun-icon lucide-sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
            </button>`;

const moonSVG = `<button style="display:flex;justify-content:center;align-items:center;">
		<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" stroke-width="1.2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon-icon lucide-moon"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
       </button>`;

const eclipseSVG = `<button style="display:flex;justify-content:center;align-items:center;">
		<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" stroke-width="1.2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eclipse-icon lucide-eclipse"><circle cx="12" cy="12" r="10"/><path d="M12 2a7 7 0 1 0 10 10"/></svg>
       </button>`;

/** The theme cycle the button walks through; icons show the CURRENT choice. */
const MODE_CYCLE = ['light', 'system', 'dark'] as const;
const MODE_ICONS: Record<(typeof MODE_CYCLE)[number], string> = {
	light: sunSVG,
	system: eclipseSVG,
	dark: moonSVG
};

export class DarkModeButton {
	private div: HTMLDivElement | undefined;

	onAdd() {
		const div = document.createElement('div');
		this.div = div;

		div.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

		this.refresh();
		div.addEventListener('contextmenu', (e) => e.preventDefault());
		div.addEventListener('click', () => {
			// Cycle light → system → dark. The style reload is not triggered
			// here: the page-level mode watcher reloads whenever the RESOLVED
			// mode drifts from the applied basemap style, so choosing e.g.
			// 'system' on a dark OS while already dark reloads nothing.
			const index = MODE_CYCLE.indexOf(userPrefersMode.current as (typeof MODE_CYCLE)[number]);
			setMode(MODE_CYCLE[(index + 1) % MODE_CYCLE.length]);
			this.refresh();
		});
		return div;
	}

	/** Re-render the icon after a mode change that didn't come from this button. */
	refresh() {
		if (!this.div) return;
		const preference = MODE_CYCLE.includes(userPrefersMode.current as (typeof MODE_CYCLE)[number])
			? (userPrefersMode.current as (typeof MODE_CYCLE)[number])
			: 'system';
		this.div.title = `Theme: ${preference}`;
		this.div.innerHTML = MODE_ICONS[preference];
	}

	onRemove() {}
}

/** The globe icon, shared with the help dialog's button legend. */
export const globeSVG = `<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" stroke-width="1.2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-globe-icon lucide-globe"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`;

/** Mapbox has no globe control: toggles the projection and the preference. */
export class GlobeButton {
	private div: HTMLDivElement | undefined;

	onAdd() {
		const div = document.createElement('div');
		this.div = div;
		div.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
		this.refresh();

		div.addEventListener('contextmenu', (e) => e.preventDefault());
		div.addEventListener('click', () => {
			globeHandler();
			this.refresh();
		});
		return div;
	}

	private refresh() {
		if (!this.div) return;
		const globe = get(p).globe;
		this.div.title = globe ? 'Disable globe' : 'Enable globe';
		this.div.innerHTML = `<button style="display:flex;justify-content:center;align-items:center;${globe ? 'color:rgb(51,181,229);' : ''}">${globeSVG}</button>`;
	}

	onRemove() {}
}

const terrainSVG = `<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" stroke-width="1.2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layers-icon lucide-layers"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/></svg>`;

/** Mapbox has no terrain control: toggles 3D terrain on the hillshade DEM. */
class TerrainButton {
	private div: HTMLDivElement | undefined;
	private map: mapboxgl.Map | undefined;

	onAdd(map: mapboxgl.Map) {
		this.map = map;
		const div = document.createElement('div');
		this.div = div;
		div.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
		this.refresh();

		div.addEventListener('contextmenu', (e) => e.preventDefault());
		div.addEventListener('click', () => {
			terrainHandler();
			this.apply();
			this.refresh();
		});
		return div;
	}

	/** Put the map's terrain in the state the preference says. */
	apply() {
		this.map?.setTerrain(get(p).terrain ? { source: 'terrainSource2', exaggeration: 1 } : null);
	}

	private refresh() {
		if (!this.div) return;
		const terrain = get(p).terrain;
		this.div.title = terrain ? 'Disable terrain' : 'Enable terrain';
		this.div.innerHTML = `<button style="display:flex;justify-content:center;align-items:center;${terrain ? 'color:rgb(51,181,229);' : ''}">${terrainSVG}</button>`;
	}

	onRemove() {
		this.map = undefined;
	}
}

export class HillshadeButton {
	private map: mapboxgl.Map | undefined;
	private terrainControl: TerrainButton | undefined;

	onAdd(map: mapboxgl.Map) {
		this.map = map;
		const div = document.createElement('div');
		div.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
		div.title = 'Hillshade';

		const noHillshadeSVG = `<button style="display:flex;justify-content:center;align-items:center;">
				<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" stroke-width="1.2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"  stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mountain-icon lucide-mountain"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>
			 </button>`;
		const hillshadeSVG = `<button style="display:flex;justify-content:center;align-items:center;color:rgb(51,181,229);">
				<svg xmlns="http://www.w3.org/2000/svg" opacity="1" stroke-width="1.2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mountain-snow-icon lucide-mountain-snow"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/><path d="M4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19"/></svg>
			</button>`;

		div.innerHTML = preferences.hillshade ? hillshadeSVG : noHillshadeSVG;

		if (preferences.hillshade) {
			addHillshadeLayer();
			// Defer to ensure HillshadeButton is appended to the DOM first, placing Terrain below it
			setTimeout(() => this.addTerrainControl(), 0);
		}

		div.addEventListener('contextmenu', (e) => e.preventDefault());
		div.addEventListener('click', () => {
			preferences.hillshade = !preferences.hillshade;
			p.set(preferences);

			if (preferences.hillshade) {
				div.innerHTML = hillshadeSVG;
				addHillshadeLayer();
				reanchorRasterLayers();

				map.once('styledata', () => {
					setTimeout(() => this.addTerrainControl(), 50);
				});
			} else {
				div.innerHTML = noHillshadeSVG;
				reanchorRasterLayers();
				if (map.getLayer('hillshadeLayer')) {
					map.removeLayer('hillshadeLayer');
				}

				map.once('styledata', () => {
					setTimeout(() => this.removeTerrainControl(), 50);
				});
			}
			updateUrl('hillshade', String(preferences.hillshade), String(defaultPreferences.hillshade));
		});
		return div;
	}

	onRemove() {
		this.removeTerrainControl();
		this.map = undefined;
	}

	private addTerrainControl() {
		if (!this.map || this.terrainControl) return;

		this.terrainControl = new TerrainButton();
		this.map.addControl(this.terrainControl);
		this.terrainControl.apply();
	}

	private removeTerrainControl() {
		if (!this.map || !this.terrainControl) return;

		if (this.map.hasControl(this.terrainControl)) {
			this.map.removeControl(this.terrainControl);
		}
		this.terrainControl = undefined;
		this.map.setTerrain(null);
	}
}

export class HelpButton {
	onAdd() {
		const div = document.createElement('div');
		div.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
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

export class ClippingButton {
	private clippingPanelOpenSubscription: () => void;
	private omProtocolSettingsSubscription: () => void;

	constructor() {
		this.clippingPanelOpenSubscription = () => {};
		this.omProtocolSettingsSubscription = () => {};
	}

	onAdd() {
		const div = document.createElement('div');
		div.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
		div.title = 'Clipping';

		const clippingSVG = `<button style="display:flex;justify-content:center;align-items:center;">
			<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" stroke-width="1.2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-scissors-icon lucide-scissors"><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></svg>
			</button>`;
		const clippingActiveSVG = `<button style="display:flex;justify-content:center;align-items:center;color:rgb(51,181,229);">
			<svg xmlns="http://www.w3.org/2000/svg" opacity="1" stroke-width="1.2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-scissors-icon lucide-scissors"><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></svg>
			</button>`;
		const clippingWarningClosedSVG = `<button style="display:flex;justify-content:center;align-items:center;color:rgb(239,68,68);">
			<svg xmlns="http://www.w3.org/2000/svg" opacity="1" stroke-width="1.5" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-scissors-icon lucide-scissors"><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></svg>
			</button>`;

		div.innerHTML = clippingSVG;

		const updateIcon = () => {
			const open = get(clippingPanelOpen);
			const hasClipping = get(omProtocolSettings).clippingOptions !== undefined;
			if (open) {
				div.innerHTML = clippingActiveSVG;
			} else if (hasClipping) {
				div.innerHTML = clippingWarningClosedSVG;
			} else {
				div.innerHTML = clippingSVG;
			}
		};

		this.clippingPanelOpenSubscription = clippingPanelOpen.subscribe(updateIcon);
		this.omProtocolSettingsSubscription = omProtocolSettings.subscribe(updateIcon);

		div.addEventListener('contextmenu', (e) => e.preventDefault());
		div.addEventListener('click', () => {
			const open = get(clippingPanelOpen);
			clippingPanelOpen.set(!open);
		});
		updateIcon();
		return div;
	}
	onRemove() {
		this.clippingPanelOpenSubscription?.();
		this.omProtocolSettingsSubscription?.();
	}
}
