<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { metaJson } from '$lib/stores/time';
	import { modelRun, time } from '$lib/stores/time';
	import { domain as domainStore, variable as variableStore } from '$lib/stores/variables';

	import * as Select from '$lib/components/ui/select';

	import {
		type PrefetchMode,
		getDateRangeForMode,
		getPrefetchModeLabel,
		prefetchData
	} from '$lib/prefetch';

	let isPrefetching = $state(false);
	let prefetchProgress = $state({ current: 0, total: 0 });
	let selectedPrefetchMode: PrefetchMode = $state('next24h');

	const prefetchModes: { value: PrefetchMode; label: string }[] = [
		{ value: 'next24h', label: 'Next 24h' },
		{ value: 'prev24h', label: 'Prev 24h' },
		{ value: 'completeModelRun', label: 'Full run' }
	];

	const handlePrefetch = async () => {
		if (!$metaJson || !$modelRun) {
			toast.warning('No metadata available for prefetching');
			return;
		}

		if (isPrefetching) {
			toast.warning('Prefetch already in progress');
			return;
		}

		isPrefetching = true;
		prefetchProgress = { current: 0, total: 0 };

		const modeLabel = getPrefetchModeLabel(selectedPrefetchMode);
		toast.info(`Prefetching ${modeLabel}...`);

		const { startDate, endDate } = getDateRangeForMode(selectedPrefetchMode, $time, $metaJson);

		const result = await prefetchData(
			{
				startDate,
				endDate,
				metaJson: $metaJson,
				modelRun: $modelRun,
				domain: $domainStore,
				variable: $variableStore
			},
			(progress) => {
				prefetchProgress = progress;
			}
		);

		isPrefetching = false;

		if (result.success) {
			toast.success(`Prefetched ${result.successCount}/${result.totalCount} time steps`);
		} else {
			toast.error(result.error || 'Prefetch failed');
		}
	};
</script>

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
	disabled={isPrefetching}
	aria-label="Prefetch data"
	title={isPrefetching
		? `Prefetching ${prefetchProgress.current}/${prefetchProgress.total}...`
		: `Prefetch ${getPrefetchModeLabel(selectedPrefetchMode)}`}
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
		class="h-4.5! text-xs px-1.5 py-0 gap-0.5 border-none bg-transparent shadow-none hover:bg-accent/50 focus-visible:ring-0 focus-visible:ring-offset-0 cursor-pointer min-w-18"
		aria-label="Select prefetch mode"
	>
		{prefetchModes.find((m) => m.value === selectedPrefetchMode)?.label ?? 'Next 24h'}
	</Select.Trigger>
	<Select.Content class="border-none bg-glass backdrop-blur-sm" sideOffset={4} align="end">
		{#each prefetchModes as mode (mode.value)}
			<Select.Item value={mode.value} label={mode.label} class="cursor-pointer text-xs">
				{mode.label}
			</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
