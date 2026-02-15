<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { metaJson } from '$lib/stores/time';
	import { modelRun, time } from '$lib/stores/time';
	import { domain as domainStore, variable as variableStore } from '$lib/stores/variables';

	import * as Select from '$lib/components/ui/select';

	import { type PrefetchMode, getDateRangeForMode, prefetchData } from '$lib/prefetch';

	let isPrefetching = $state(false);
	let prefetchProgress = $state({ current: 0, total: 0 });
	let selectedPrefetchMode: PrefetchMode = $state('today');
	let abortController: AbortController | null = null;

	const prefetchModes = new Map<PrefetchMode, string>([
		['today', 'Today'],
		['next24h', 'Next 24h'],
		['prev24h', 'Prev 24h'],
		['completeModelRun', 'Full run']
	]);

	let prefetchModeLabel: string = $derived(prefetchModes.get(selectedPrefetchMode) ?? 'Today');

	const handlePrefetch = async () => {
		if (isPrefetching) {
			abortController?.abort();
			return;
		}

		if (!$metaJson || !$modelRun) {
			toast.warning('No metadata available for prefetching');
			return;
		}

		isPrefetching = true;
		prefetchProgress = { current: 0, total: 0 };
		abortController = new AbortController();

		toast.info(`Prefetching ${prefetchModeLabel}...`);

		const { startDate, endDate } = getDateRangeForMode(selectedPrefetchMode, $time, $metaJson);

		const result = await prefetchData(
			{
				startDate,
				endDate,
				metaJson: $metaJson,
				modelRun: $modelRun,
				domain: $domainStore,
				variable: $variableStore,
				signal: abortController.signal
			},
			(progress) => {
				prefetchProgress = progress;
			}
		);

		isPrefetching = false;
		abortController = null;

		if (result.success) {
			toast.success(`Prefetched ${result.successCount}/${result.totalCount} time steps`);
		} else if (result.aborted) {
			toast.info(`Prefetch cancelled (${result.successCount}/${result.totalCount} completed)`);
		} else {
			toast.error(result.error || 'Prefetch failed');
		}
	};
</script>

<!-- Prefetch Mode Select -->
<Select.Root
	type="single"
	value={selectedPrefetchMode}
	onValueChange={(v) => {
		if (v) {
			selectedPrefetchMode = v as PrefetchMode;
		}
	}}
>
	<Select.Trigger
		class="h-4.5! text-xs pl-1.5 pr-0.75 py-0 gap-1 border-none bg-transparent shadow-none hover:bg-accent/50 focus-visible:ring-0 focus-visible:ring-offset-0 cursor-pointer"
		aria-label="Select prefetch mode"
		disabled={isPrefetching}
	>
		{prefetchModes.get(selectedPrefetchMode) ?? 'Today'}
	</Select.Trigger>
	<Select.Content
		class="left-5 border-none max-h-60 bg-glass/65 backdrop-blur-sm"
		sideOffset={4}
		align="end"
	>
		{#each Array.from(prefetchModes.entries()) as [value, label] (value)}
			<Select.Item {value} {label} class="cursor-pointer text-xs">
				{label}
			</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
<!-- Prefetch Button -->
<button
	class="cursor-pointer w-4 h-4.5 flex items-center justify-center {isPrefetching
		? 'animate-pulse'
		: ''}"
	onclick={(e) => {
		e.preventDefault();
		e.stopPropagation();
		handlePrefetch();
	}}
	aria-label={isPrefetching ? 'Cancel prefetch' : 'Prefetch data'}
	title={isPrefetching
		? `Prefetching ${prefetchProgress.current}/${prefetchProgress.total}. Click to cancel.`
		: `Prefetch ${prefetchModeLabel}`}
>
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
		class="{isPrefetching
			? 'text-blue-500'
			: 'text-foreground/70 hover:text-foreground'} lucide lucide-download-icon"
	>
		<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
		<polyline points="7 10 12 15 17 10" />
		<line x1="12" x2="12" y1="15" y2="3" />
	</svg>
</button>
