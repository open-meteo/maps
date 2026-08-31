<script lang="ts">
	import { onDestroy } from 'svelte';

	import { toast } from 'svelte-sonner';

	import { loading } from '$lib/stores/preferences';
	import { metaJson, modelRun, time } from '$lib/stores/time';

	import * as Select from '$lib/components/ui/select';

	import { MILLISECONDS_PER_DAY } from '$lib/constants';
	import { changeOMfileURL } from '$lib/layers';
	import { formatISOWithoutTimezone } from '$lib/time-format';
	import { updateUrl } from '$lib/url';

	type AnimateRange = '1d' | '2d' | '5d';

	const animateRanges = new Map<AnimateRange, string>([
		['1d', '1 day'],
		['2d', '2 days'],
		['5d', '5 days']
	]);
	const rangeDays: Record<AnimateRange, number> = { '1d': 1, '2d': 2, '5d': 5 };

	// 1 day is the sweet spot: hourly steps on most domains, so the loop is
	// smooth, and after the first pass every frame is served from cache.
	let selectedRange: AnimateRange = $state('1d');
	let playing = $state(false);

	let disabled = $derived($modelRun === undefined);

	// Fixed at play(): the loop always returns to the time it started from.
	let windowStart = 0;

	let timer: ReturnType<typeof setTimeout> | undefined;

	// A frame lasts at least the GPU layer's 250ms value blend, so each step
	// finishes morphing before the next begins.
	const FRAME_MS = 350;

	const tick = () => {
		if (!playing) return;
		timer = setTimeout(tick, FRAME_MS);
		// Wait for the current frame's data instead of racing ahead of the network.
		if ($loading) return;

		const windowEnd = windowStart + rangeDays[selectedRange] * MILLISECONDS_PER_DAY;
		const steps = ($metaJson?.valid_times ?? [])
			.map((validTime: string) => new Date(validTime))
			.filter((step) => step.getTime() >= windowStart && step.getTime() <= windowEnd);
		if (steps.length < 2) {
			stop();
			toast.warning('Not enough time steps to animate');
			return;
		}

		const current = $time.getTime();
		const next = steps.find((step) => step.getTime() > current) ?? steps[0];
		$time = next;
		updateUrl('time', formatISOWithoutTimezone(next));
		changeOMfileURL();
	};

	const play = () => {
		if (!$metaJson || !$modelRun) {
			toast.warning('No metadata available for animation');
			return;
		}
		windowStart = $time.getTime();
		playing = true;
		tick();
	};

	const stop = () => {
		playing = false;
		clearTimeout(timer);
	};

	onDestroy(stop);
</script>

<!-- Play / Pause Button -->
<button
	class="w-4 h-4.5 flex items-center justify-center {disabled
		? 'cursor-not-allowed'
		: 'cursor-pointer'}"
	{disabled}
	onclick={(e) => {
		e.preventDefault();
		e.stopPropagation();
		if (playing) {
			stop();
		} else {
			play();
		}
	}}
	aria-label={playing ? 'Pause animation' : 'Play animation'}
	title={playing ? 'Pause animation' : `Animate ${animateRanges.get(selectedRange)}`}
>
	{#if playing}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="text-blue-500 lucide lucide-pause-icon"
		>
			<rect x="14" y="4" width="4" height="16" rx="1" />
			<rect x="6" y="4" width="4" height="16" rx="1" />
		</svg>
	{:else}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="text-foreground/70 hover:text-foreground lucide lucide-play-icon"
		>
			<polygon points="6 3 20 12 6 21 6 3" />
		</svg>
	{/if}
</button>
<!-- Animation Range Select -->
<Select.Root
	type="single"
	value={selectedRange}
	onValueChange={(v) => {
		if (v) {
			selectedRange = v as AnimateRange;
		}
	}}
>
	<Select.Trigger
		class="h-4.5! text-xs pl-1.5 pr-0.75 py-0 gap-1 border-none bg-transparent shadow-none hover:bg-accent/50 focus-visible:ring-0 focus-visible:ring-offset-0 cursor-pointer"
		aria-label="Select animation range"
		{disabled}
	>
		{animateRanges.get(selectedRange) ?? '1 day'}
	</Select.Trigger>
	<Select.Content
		class="border-none max-h-60 bg-glass/65 backdrop-blur-sm"
		sideOffset={4}
		align="start"
	>
		{#each Array.from(animateRanges.entries()) as [value, label] (value)}
			<Select.Item {value} {label} class="cursor-pointer text-xs">
				{label}
			</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
