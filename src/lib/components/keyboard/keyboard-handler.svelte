<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { get } from 'svelte/store';

	import { toast } from 'svelte-sonner';

	import { browser } from '$app/environment';

	import { timeSelectorActions } from '$lib/stores/keyboard';
	import { map, popup, popupMode } from '$lib/stores/map';
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
			if (p) p.remove();
			popup.set(undefined);
			toast.dismiss();
			return;
		}

		// Variable Selection Navigation
		const canNavigateSelection =
			get(variableSelectionExtended) &&
			!get(variableSelectionOpen) &&
			!get(domainSelectionOpen) &&
			!get(pressureLevelsSelectionOpen);

		if (canNavigateSelection && !event.ctrlKey) {
			if (event.key === 'v') {
				variableSelectionOpen.set(true);
				return;
			}
			if (event.key === 'd') {
				domainSelectionOpen.set(true);
				return;
			}
			if (event.key === 'l') {
				pressureLevelsSelectionOpen.set(true);
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
