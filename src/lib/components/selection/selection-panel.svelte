<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';

	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	import { activeChart, addSource, isSingleVariableChart } from '$lib/stores/chart';
	import { desktop } from '$lib/stores/preferences';
	import { metaJson } from '$lib/stores/time';
	import {
		levelGroupSelected,
		variableSelectionExtended as vSE,
		variableSelectionOpen as vSO,
		variable
	} from '$lib/stores/variables';

	import * as Command from '$lib/components/ui/command';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Separator } from '$lib/components/ui/separator';

	import { suppressPopupTap } from '$lib/popup';

	import AllVariablesDialog from './all-variables-dialog.svelte';
	import ChartEditor from './chart-editor.svelte';
	import ChartList from './chart-list.svelte';
	import DomainSelect from './domain-select.svelte';
	import OtherVariables from './other-variables.svelte';
	import PopularVariables from './popular-variables.svelte';
	import SearchResults from './search-results.svelte';

	const extended = $derived($vSE);

	let panelEl: HTMLDivElement | undefined = $state();

	// On mobile, a tap beside the open panel collapses it. Taps inside
	// portalled popovers/dialogs belong to panel flows and are ignored.
	const onDocumentPointerDown = (e: PointerEvent) => {
		if (desktop.current || !get(vSE)) return;
		const target = e.target as HTMLElement | null;
		if (!target || panelEl?.contains(target)) return;
		if (
			target.closest(
				'[data-slot="popover-content"], [data-slot="dialog-content"], [data-slot="dialog-overlay"], [data-sonner-toast]'
			)
		) {
			return;
		}
		vSE.set(false);
		// The same tap must not also toggle the map value popup
		suppressPopupTap();
	};

	onMount(() => {
		if (desktop.current && get(vSE) === null) {
			vSE.set(true);
		}
		document.addEventListener('pointerdown', onDocumentPointerDown, true);
		return () => document.removeEventListener('pointerdown', onDocumentPointerDown, true);
	});

	let searchQuery = $state('');
	const searching = $derived(searchQuery.trim().length > 0);

	// "Add variable" flow: the pick dialog adds a source to the current chart
	let addingToChart = $state(false);

	const openAddVariable = () => {
		addingToChart = true;
		vSO.set(true);
	};

	$effect(() => {
		if (!$vSO) addingToChart = false;
	});

	// Row hosting the nested level selector: the active level group (stays put
	// while switching levels within it), else the plain active variable. Both
	// the popular and the all-variables list render it under their matching
	// row; the selector itself hides when there is nothing to pick.
	const levelHostId = $derived.by(() => {
		if (!isSingleVariableChart($activeChart)) return undefined;
		return $levelGroupSelected?.value ?? $variable;
	});
</script>

<div
	bind:this={panelEl}
	class="absolute top-2.5 z-70 flex gap-2.5 duration-300 {extended ? 'left-2.5' : '-left-64.5'}"
>
	<div
		class="bg-glass/75 dark:bg-glass/75 flex w-64 flex-col overflow-hidden rounded shadow-md backdrop-blur-sm"
	>
		{#if !$metaJson}
			<div class="flex animate-pulse flex-col gap-2 p-2.5">
				<div class="bg-primary/10 h-5 w-3/4 rounded"></div>
				<div class="bg-primary/10 h-4 w-full rounded"></div>
				<div class="bg-primary/10 h-4 w-full rounded"></div>
				<div class="bg-primary/10 h-4 w-2/3 rounded"></div>
			</div>
		{:else}
			<DomainSelect />
			<Separator class="bg-primary/10" />
			<Command.Root class="bg-transparent!">
				<Command.Input
					class="h-8 border-none ring-0"
					placeholder="Search variables & charts..."
					data-panel-search
					bind:value={searchQuery}
					onkeydown={(e) => {
						if (e.key === 'Escape') {
							searchQuery = '';
							(e.currentTarget as HTMLInputElement).blur();
							e.stopPropagation();
						}
					}}
				/>
				<ScrollArea
					type="always"
					class="max-h-[calc(100dvh-21rem)] min-h-0 md:max-h-[50vh]"
					scrollbarYClasses="opacity-80"
				>
					{#if searching}
						<SearchResults onDone={() => (searchQuery = '')} />
					{:else}
						<PopularVariables {levelHostId} />
						<OtherVariables {levelHostId} />
						<Separator class="bg-primary/10" />
						<ChartList />
						<Separator class="bg-primary/10" />
						<div
							class="text-muted-foreground flex h-7.5 items-center px-3 text-xs font-semibold tracking-wide uppercase"
						>
							Current chart
						</div>
						<ChartEditor onAddVariable={openAddVariable} />
					{/if}
				</ScrollArea>
			</Command.Root>
		{/if}
	</div>

	<button
		class="bg-glass/75 backdrop-blur-sm shadow-md hover:bg-glass/95 duration-200 h-7.25 w-7.25 flex cursor-pointer items-center justify-center rounded p-0 z-20 self-start"
		onclick={() => {
			vSE.set(!get(vSE));
		}}
		aria-label="Hide Variable Selection"
	>
		{#if extended}
			<ChevronLeftIcon class="-mr-1.25 size-4.25" strokeWidth={2} />
		{:else}
			<ChevronRightIcon class="-mr-1.25 size-4.25" strokeWidth={2} />
		{/if}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			opacity="0.75"
			stroke-width="1.75"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="lucide lucide-variable-icon lucide-variable"
			><path d="M8 21s-4-3-4-9 4-9 4-9" /><path d="M16 3s4 3 4 9-4 9-4 9" /><line
				x1="15"
				x2="9"
				y1="9"
				y2="15"
			/><line x1="9" x2="15" y1="9" y2="15" /></svg
		>
	</button>
</div>

<AllVariablesDialog onPick={addingToChart ? (v) => addSource(v) : undefined} />
