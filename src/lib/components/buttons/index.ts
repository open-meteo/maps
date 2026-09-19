import { get } from 'svelte/store';

import L from 'leaflet';
import { setMode, userPrefersMode } from 'mode-watcher';

import { clippingPanelOpen } from '$lib/stores/clipping';
import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
import { helpOpen as hO, sheet } from '$lib/stores/preferences';

/**
 * The map buttons as Leaflet controls: a `leaflet-bar` box (styled like the
 * MapLibre control groups in styles.css) holding one `<button>`. Clicks must
 * not reach the map, or every button press would also toggle the popup.
 */
const controlBox = (title: string): HTMLDivElement => {
	const div = document.createElement('div');
	div.className = 'leaflet-bar leaflet-control om-ctrl';
	div.title = title;
	L.DomEvent.disableClickPropagation(div);
	L.DomEvent.disableScrollPropagation(div);
	div.addEventListener('contextmenu', (e) => e.preventDefault());
	return div;
};

export class SettingsButton extends L.Control {
	constructor() {
		super({ position: 'topright' });
	}

	onAdd() {
		const div = controlBox('Settings');
		div.innerHTML = `<button style="display:flex;justify-content:center;align-items:center;">
				<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings-icon lucide-settings"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
       </button>`;
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

export class DarkModeButton extends L.Control {
	private div: HTMLDivElement | undefined;

	constructor() {
		super({ position: 'topright' });
	}

	onAdd() {
		const div = controlBox('Theme');
		this.div = div;

		this.refresh();
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

/** The locate icon, shared with the help dialog's button legend. */
export const locateSVG = `<svg xmlns="http://www.w3.org/2000/svg" opacity="0.75" stroke-width="1.2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-locate-fixed-icon lucide-locate-fixed"><line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/></svg>`;

/** Leaflet has no geolocate control: the button centres the map on the user. */
export class LocateButton extends L.Control {
	constructor() {
		super({ position: 'topright' });
	}

	onAdd(map: L.Map) {
		const div = controlBox('Find my location');
		div.innerHTML = `<button style="display:flex;justify-content:center;align-items:center;">${locateSVG}</button>`;
		div.addEventListener('click', () => {
			map.locate({ setView: true, maxZoom: 13.5, enableHighAccuracy: true });
		});
		return div;
	}
	onRemove() {}
}

export class HelpButton extends L.Control {
	constructor() {
		super({ position: 'topright' });
	}

	onAdd() {
		const div = controlBox('Help');

		const helpSVG = `<button style="display:flex;justify-content:center;align-items:center;">
			<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" opacity="0.75" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-circle-question-mark-icon lucide-message-circle-question-mark"><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
			 </button>`;
		div.innerHTML = helpSVG;

		div.addEventListener('click', () => {
			const helpOpen = get(hO);
			hO.set(!helpOpen);
		});
		return div;
	}
	onRemove() {}
}

export class ClippingButton extends L.Control {
	private clippingPanelOpenSubscription: () => void;
	private omProtocolSettingsSubscription: () => void;

	constructor() {
		super({ position: 'topright' });
		this.clippingPanelOpenSubscription = () => {};
		this.omProtocolSettingsSubscription = () => {};
	}

	onAdd() {
		const div = controlBox('Clipping');

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
