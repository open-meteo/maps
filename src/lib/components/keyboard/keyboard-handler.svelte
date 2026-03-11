<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { get } from 'svelte/store';

	import { toast } from 'svelte-sonner';

	import { browser } from '$app/environment';

	import { map, popup, popupMode } from '$lib/stores/map';
	import { helpOpen } from '$lib/stores/preferences';
	import {
		domainSelectionOpen,
		pressureLevelsSelectionOpen,
		variableSelectionExtended,
		variableSelectionOpen
	} from '$lib/stores/variables';

	import { takeSnapshot } from '$lib/helpers';
	import { switchPopupMode } from '$lib/popup';

	// Props for time-selector actions as we can't easily import them
	let {
		previousHour,
		nextHour,
		previousDay,
		nextDay,
		previousModel,
		nextModel,
		jumpToCurrentTime,
		toggleModelRunLock,
		setLatestModelRun,
		disabled = false
	} = $props<{
		previousHour?: () => void;
		nextHour?: () => void;
		previousDay?: () => void;
		nextDay?: () => void;
		previousModel?: () => void;
		nextModel?: () => void;
		jumpToCurrentTime?: () => void;
		toggleModelRunLock?: () => void;
		setLatestModelRun?: () => void;
		disabled?: boolean;
	}>();

	const keyDownEvent = (event: KeyboardEvent) => {
		// Global actions (Snapshot)
		if (event.key === 's' && !event.ctrlKey) {
			const m = get(map);
			if (m) takeSnapshot(m);
			return;
		}

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

			if (disabled && event.key !== 'm') return;

			if (event.key === 'ArrowLeft') (event.ctrlKey ? previousModel : previousHour)?.();
			else if (event.key === 'ArrowRight') (event.ctrlKey ? nextModel : nextHour)?.();
			else if (event.key === 'ArrowDown') previousDay?.();
			else if (event.key === 'ArrowUp') nextDay?.();
			else if (event.key === 'c') jumpToCurrentTime?.();
			else if (event.key === 'm') toggleModelRunLock?.();
			else if (event.key === 'n') setLatestModelRun?.();
		}
	};

	onMount(() => {
		if (browser) window.addEventListener('keydown', keyDownEvent);
	});

	onDestroy(() => {
		if (browser) window.removeEventListener('keydown', keyDownEvent);
	});
</script>
