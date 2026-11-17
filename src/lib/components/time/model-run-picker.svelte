<script lang="ts">
	import LockIcon from '@lucide/svelte/icons/lock';
	import LockOpenIcon from '@lucide/svelte/icons/lock-open';

	import { inProgress, latest, metaJson, modelRun, modelRunLocked } from '#lib/stores/time.js';
	import { selectedDomain } from '#lib/stores/variables.js';

	import * as Select from '#lib/components/ui/select/index.js';

	import { availableRuns } from '#lib/model-runs.js';
	import { formatUTCDate, formatUTCDateTime, formatUTCTime } from '#lib/time-format.js';
	import { selectModelRun, toggleModelRunLock } from '#lib/time-navigation.js';

	const latestRun = $derived($latest ? new Date($latest.reference_time) : undefined);
	// The in-progress run is only a separate entry while it differs from the latest
	const runningRun = $derived(
		$inProgress && $inProgress.reference_time !== $latest?.reference_time
			? new Date($inProgress.reference_time)
			: undefined
	);
	const runs = $derived(
		latestRun ? availableRuns(latestRun, $selectedDomain.model_interval, runningRun) : []
	);
</script>

<div class="flex items-center gap-0.5">
	<Select.Root
		type="single"
		value={$modelRun ? String($modelRun.getTime()) : ''}
		onValueChange={(v) => {
			if (v) selectModelRun(new Date(Number(v)));
		}}
	>
		<Select.Trigger
			class="h-5! gap-1 rounded-md border-none bg-transparent px-1 py-0 text-xs font-medium shadow-none hover:bg-foreground/5 focus-visible:ring-0 focus-visible:ring-offset-0 cursor-pointer [&_svg]:size-3"
			aria-label="Select model run"
			disabled={!$metaJson}
		>
			{#if !$metaJson}
				<span class="h-3 w-16 animate-pulse rounded bg-foreground/10"></span>
			{:else if $modelRun}
				<span class="text-foreground/70">{formatUTCDate($modelRun)}</span>
				<span class="tabular-nums">{formatUTCTime($modelRun)}Z</span>
			{:else}
				Select model run
			{/if}
		</Select.Trigger>
		<Select.Content
			class="max-h-64 border-none bg-glass/85 shadow-xl ring-1 ring-foreground/10 backdrop-blur-md"
			sideOffset={10}
			align="end"
		>
			{#each runs as run (run.getTime())}
				{@const isLatest = run.getTime() === latestRun?.getTime()}
				{@const isRunning = run.getTime() === runningRun?.getTime()}
				<Select.Item
					value={String(run.getTime())}
					label={formatUTCDateTime(run)}
					class="cursor-pointer border-l-2 text-xs {isRunning
						? 'border-l-orange-500 text-orange-600 dark:text-orange-400'
						: isLatest
							? 'border-l-green-600 dark:border-l-green-500'
							: 'border-l-transparent'}"
				>
					<small class="min-w-8 text-muted-foreground">{formatUTCDate(run)}</small>
					<span class="tabular-nums">{formatUTCTime(run)}Z</span>
					{#if isRunning}
						<span class="text-[9px] tracking-wide uppercase opacity-80">running</span>
					{:else if isLatest}
						<span class="text-[9px] tracking-wide text-green-700 uppercase dark:text-green-500"
							>latest</span
						>
					{/if}
				</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
	<button
		class="flex size-5 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-foreground/5"
		onclick={toggleModelRunLock}
		aria-pressed={$modelRunLocked}
		aria-label={$modelRunLocked ? 'Unlock model run' : 'Lock model run'}
		title={$modelRunLocked
			? 'Model run locked: time stays within this run'
			: 'Model run follows the selected time'}
	>
		{#if $modelRunLocked}
			<LockIcon size={12} strokeWidth={2.5} class="text-red-600 dark:text-red-400" />
		{:else}
			<LockOpenIcon size={12} strokeWidth={2.5} class="text-foreground/50" />
		{/if}
	</button>
</div>
