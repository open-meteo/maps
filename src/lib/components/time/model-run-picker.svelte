<script lang="ts">
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import LockIcon from '@lucide/svelte/icons/lock';
	import LockOpenIcon from '@lucide/svelte/icons/lock-open';

	import { inProgress, latest, metaJson, modelRun, modelRunLocked } from '#lib/stores/time.js';
	import { selectedDomain } from '#lib/stores/variables.js';

	import * as Popover from '#lib/components/ui/popover/index.js';
	import * as Select from '#lib/components/ui/select/index.js';

	import { pad } from '#lib/helpers.js';
	import { availableRuns, modelIntervalHours, runCatalogue } from '#lib/model-runs.js';
	import { formatUTCDate, formatUTCDateTime, formatUTCTime } from '#lib/time-format.js';
	import { selectModelRun, toggleModelRunLock } from '#lib/time-navigation.js';

	const latestRun = $derived($latest ? new Date($latest.reference_time) : undefined);
	// The in-progress run is only a separate entry while it differs from the latest
	const runningRun = $derived(
		$inProgress && $inProgress.reference_time !== $latest?.reference_time
			? new Date($inProgress.reference_time)
			: undefined
	);
	const catalogue = $derived(latestRun ? runCatalogue($selectedDomain, latestRun) : undefined);
	// The list is the week ending at the selected run: all there is on the
	// server, a window into an archive (which the date jump moves)
	const runs = $derived(
		catalogue ? availableRuns(catalogue, $modelRun ?? catalogue.newest, runningRun) : []
	);

	const isoDay = (date: Date) =>
		`${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

	let jumpOpen = $state(false);
	let jumpDay = $state('');
	const jumpHours = $derived(
		catalogue
			? Array.from(
					{ length: 24 / modelIntervalHours(catalogue.interval) },
					(_, i) => i * modelIntervalHours(catalogue.interval)
				)
			: []
	);

	const jumpTo = (hour: number) => {
		if (!jumpDay || !catalogue) return;
		const [year, month, day] = jumpDay.split('-').map(Number);
		const run = new Date(Date.UTC(year, month - 1, day, hour));
		jumpOpen = false;
		if (run.getTime() < catalogue.oldest.getTime() || run.getTime() > catalogue.newest.getTime())
			return;
		selectModelRun(run);
	};

	$effect(() => {
		if (jumpOpen && $modelRun) jumpDay = isoDay($modelRun);
	});
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

	{#if catalogue?.kind === 'archive'}
		<!-- An archive holds years of runs: pick any date, then the cycle -->
		<Popover.Root bind:open={jumpOpen}>
			<Popover.Trigger
				class="flex size-5 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-foreground/5"
				aria-label="Jump to a run by date"
				title="Jump to a run by date"
			>
				<CalendarIcon size={12} strokeWidth={2.5} class="text-foreground/60" />
			</Popover.Trigger>
			<Popover.Content
				class="w-auto border-none bg-glass/85 p-2.5 shadow-xl ring-1 ring-foreground/10 backdrop-blur-md"
				align="end"
				sideOffset={10}
			>
				<div class="flex flex-col gap-2 text-xs">
					<input
						type="date"
						class="rounded-md bg-foreground/5 px-2 py-1 tabular-nums"
						min={isoDay(catalogue.oldest)}
						max={isoDay(catalogue.newest)}
						bind:value={jumpDay}
						aria-label="Run date (UTC)"
					/>
					<div class="flex gap-1">
						{#each jumpHours as hour (hour)}
							<button
								class="flex-1 cursor-pointer rounded-md bg-foreground/5 px-2 py-1 tabular-nums transition-colors hover:bg-primary hover:text-primary-foreground"
								onclick={() => jumpTo(hour)}>{pad(hour)}Z</button
							>
						{/each}
					</div>
				</div>
			</Popover.Content>
		</Popover.Root>
	{/if}

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
