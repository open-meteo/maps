<script lang="ts">
	import { onMount } from 'svelte';

	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';

	import { compareDomain, compareSplit, compareTime } from '#lib/stores/compare.js';
	import { time } from '#lib/stores/time.js';
	import { domain } from '#lib/stores/variables.js';

	import DomainSelect from '#lib/components/selection/domain-select.svelte';

	import { createCompareMap, destroyCompareMap, loadCompareMetaData } from '#lib/compare.js';
	import { formatUTCDateTime } from '#lib/time-format.js';

	let container: HTMLDivElement;

	onMount(() => {
		createCompareMap(container);
		return destroyCompareMap;
	});

	// The run info does not wait for the map: whichever of the two is ready
	// last shows the first frame
	$effect(() => {
		if ($compareDomain) loadCompareMetaData($compareDomain);
	});

	let leftOpen = $state(false);
	let rightOpen = $state(false);

	// Pointer capture keeps a fast drag on the handle once the pointer has
	// left it
	let dragging = $state(false);
	const onPointerDown = (e: PointerEvent) => {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragging = true;
	};
	const onPointerMove = (e: PointerEvent) => {
		if (!dragging) return;
		const { left, width } = container.getBoundingClientRect();
		$compareSplit = Math.min(Math.max((e.clientX - left) / width, 0.05), 0.95);
	};
	const onPointerUp = () => {
		dragging = false;
	};

	const left = $derived(`${$compareSplit * 100}%`);
	// Only equal when both models share the time step and horizon
	const timeDiffers = $derived($compareTime && $compareTime.getTime() !== $time.getTime());
</script>

<!-- The compare map covers the main map and is clipped to the right of the
     divider, which leaves the left part to the main map underneath. The
     `map` class, not Tailwind's `absolute`: MapLibre's own stylesheet makes
     every map container `position: relative` with `overflow: hidden`, and
     being unlayered it beats a layered utility, which left this container
     with no height and the canvas clipped away. -->
<div bind:this={container} class="map" style="clip-path: inset(0 0 0 {left})"></div>

<!-- The divider: a hairline under the bottom overlays, and the grab handle
     as the only part taking pointer events -->
<div class="pointer-events-none absolute inset-y-0 z-10 w-0" style="left: {left}">
	<div class="bg-glass/90 absolute inset-y-0 -left-px w-0.5"></div>
	<button
		class="bg-glass/85 hover:bg-glass pointer-events-auto absolute top-1/2 left-0 flex h-10 w-7 -translate-x-1/2 -translate-y-1/2 cursor-col-resize touch-none items-center justify-center rounded shadow-md backdrop-blur-sm"
		aria-label="Move the divider"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
	>
		<GripVerticalIcon class="size-4" />
	</button>
</div>

<!-- The domain of each half, hanging off the divider -->
<div class="absolute top-2.5 z-60 flex -translate-x-1/2 gap-2.5" style="left: {left}">
	<div class="bg-glass/75 w-36 overflow-hidden rounded shadow-md backdrop-blur-sm md:w-52">
		<DomainSelect selected={$domain} onSelect={(value) => ($domain = value)} bind:open={leftOpen} />
	</div>
	<div class="bg-glass/75 w-36 overflow-hidden rounded shadow-md backdrop-blur-sm md:w-52">
		<DomainSelect
			selected={$compareDomain ?? undefined}
			onSelect={(value) => ($compareDomain = value)}
			bind:open={rightOpen}
		/>
		{#if timeDiffers && $compareTime}
			<div class="text-muted-foreground px-3 pb-1 text-xs">
				Nearest step: {formatUTCDateTime($compareTime)}Z
			</div>
		{/if}
	</div>
</div>
