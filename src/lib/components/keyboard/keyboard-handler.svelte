<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { get } from 'svelte/store';

	import { toast } from 'svelte-sonner';

	import { browser } from '$app/environment';

	import { timeSelectorActions } from '$lib/stores/keyboard';
	import { popup, popupMode } from '$lib/stores/map';
	import { helpOpen } from '$lib/stores/preferences';
	import {
		domainSelectionOpen,
		pressureLevelsSelectionOpen,
		variableSelectionExtended,
		variableSelectionOpen
	} from '$lib/stores/variables';

	import { switchPopupMode } from '$lib/popup';

	const keyDownEvent = (event: KeyboardEvent) => {
		// Ignore shortcuts when focus is inside an editable element, except for Escape
		const target = event.target as HTMLElement;
		const isEditable =
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLSelectElement ||
			target.isContentEditable;
		if (isEditable && event.key !== 'Escape') return;

		// Help Dialog and Popup actions
		if (event.key === 'h') {
			helpOpen.set(!get(helpOpen));
			return;
		}

		if (event.key === 'p') {
			switchPopupMode();
			const mode = get(popupMode);
			toast.info(
				'Popup mode: ' + (mode ? (mode === 'follow' ? 'Follows mouse' : 'Draggable') : 'Off')
			);
			return;
		}

		if (event.key === 'Escape') {
			popupMode.set(null);
			const p = get(popup);
			if (p) p.setMap(null);
			popup.set(undefined);
			toast.dismiss();
			// The panel's search field takes Escape first and stops it there, so a
			// query is cleared before a second press collapses the panel
			variableSelectionExtended.set(false);
			return;
		}

		// Variable Selection Navigation
		const selectionOverlayOpen =
			get(variableSelectionOpen) || get(domainSelectionOpen) || get(pressureLevelsSelectionOpen);

		// Unlike its neighbours below, `v` opens the panel, so it cannot require
		// the panel to be open already
		if (event.key === 'v' && !selectionOverlayOpen && !event.ctrlKey) {
			event.preventDefault();
			variableSelectionExtended.set(true);
			// The panel stays rendered while collapsed (it slides off-screen), so
			// the field is there to focus; preventScroll keeps that offset from
			// dragging the viewport along
			const searchInput = document.querySelector('[data-panel-search]') as HTMLElement | null;
			searchInput?.focus({ preventScroll: true });
			return;
		}

		const canNavigateSelection = get(variableSelectionExtended) && !selectionOverlayOpen;

		if (canNavigateSelection && !event.ctrlKey) {
			if (event.key === 'a') {
				// Routed through the panel's button rather than the dialog's open
				// flag: the flag alone opens a dialog whose picks go nowhere, since
				// the panel owns the add-to-chart handler
				event.preventDefault();
				const addButton = document.querySelector('[data-add-variable]') as HTMLElement | null;
				addButton?.click();
				return;
			}
			if (event.key === 'd') {
				domainSelectionOpen.set(true);
				return;
			}
			if (event.key === 'l') {
				// Only when a level selector is rendered, else the open flag
				// would stay stuck and block the other shortcuts
				if (document.querySelector('[data-level-select]')) {
					pressureLevelsSelectionOpen.set(true);
				}
				return;
			}
		}

		// Time Selector Navigation
		const canNavigateTime = !(get(domainSelectionOpen) || get(variableSelectionOpen));
		if (canNavigateTime) {
			const isTimeAction = [
				'ArrowLeft',
				'ArrowRight',
				'ArrowDown',
				'ArrowUp',
				'c',
				'm',
				'n'
			].includes(event.key);
			if (!isTimeAction) return;

			const { timeNavigationDisabled } = get(timeSelectorActions);

			if (timeNavigationDisabled && event.key !== 'm') return;

			const actions = get(timeSelectorActions);
			if (event.key === 'ArrowLeft')
				(event.ctrlKey ? actions.previousModel : actions.previousHour)?.();
			else if (event.key === 'ArrowRight')
				(event.ctrlKey ? actions.nextModel : actions.nextHour)?.();
			else if (event.key === 'ArrowDown') actions.previousDay?.();
			else if (event.key === 'ArrowUp') actions.nextDay?.();
			else if (event.key === 'c') actions.jumpToCurrentTime?.();
			else if (event.key === 'm') actions.toggleModelRunLock?.();
			else if (event.key === 'n') actions.setLatestModelRun?.();
		}
	};

	onMount(() => {
		if (browser) window.addEventListener('keydown', keyDownEvent);
	});

	onDestroy(() => {
		if (browser) window.removeEventListener('keydown', keyDownEvent);
	});
</script>
