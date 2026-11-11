<script lang="ts">
	import { latest, time } from '#lib/stores/time.js';

	import * as Select from '#lib/components/ui/select/index.js';

	import { ARCHIVE_START } from '#lib/archive.js';
	import { pad } from '#lib/helpers.js';
	import { selectTime, validTimes } from '#lib/time-navigation.js';
	import { monthsBefore } from '#lib/time-utils.js';

	// Jumps back from the present: an archive is browsed by "how long ago"
	const PRESETS: { value: string; label: string; back: (now: Date) => Date }[] = [
		{ value: 'now', label: 'Now', back: (now) => now },
		{
			value: 'week',
			label: '1 week ago',
			back: (now) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, now.getHours())
		},
		{ value: '1m', label: '1 month ago', back: (now) => monthsBefore(now, 1) },
		{ value: '3m', label: '3 months ago', back: (now) => monthsBefore(now, 3) },
		{ value: '6m', label: '6 months ago', back: (now) => monthsBefore(now, 6) },
		{ value: '1y', label: '1 year ago', back: (now) => monthsBefore(now, 12) },
		{ value: '2y', label: '2 years ago', back: (now) => monthsBefore(now, 24) },
		{ value: '3y', label: '3 years ago', back: (now) => monthsBefore(now, 36) },
		{ value: 'start', label: 'Start of archive', back: () => ARCHIVE_START }
	];

	const isoLocalDay = (date: Date) =>
		`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

	// The newest instant the archive serves: the end of its newest run
	const newestTime = $derived(validTimes($latest).at(-1));
	const day = $derived(isoLocalDay($time));

	// The chosen date at the selected time of day: what the map shows moves
	// to another day, the hour stays comparable
	const onDay = (e: Event) => {
		const [year, month, dayOfMonth] = (e.currentTarget as HTMLInputElement).value
			.split('-')
			.map(Number);
		if (!year || !month || !dayOfMonth) return;
		selectTime(new Date(year, month - 1, dayOfMonth, $time.getHours(), $time.getMinutes()));
	};

	// The select is a menu of actions: it never holds a value
	let preset = $state('');
	const onPreset = (value: string) => {
		const chosen = PRESETS.find((candidate) => candidate.value === value);
		preset = '';
		if (chosen) selectTime(chosen.back(new Date()));
	};
</script>

<!-- A column beside the run cluster on wide screens, one row below the track on phones -->
<div class="flex items-center gap-1.5 text-xs md:flex-col md:items-stretch md:gap-1">
	<input
		type="date"
		class="h-5 cursor-pointer rounded-md bg-transparent px-1 font-medium tabular-nums transition-colors hover:bg-foreground/5 focus-visible:outline-none"
		value={day}
		min={isoLocalDay(ARCHIVE_START)}
		max={newestTime ? isoLocalDay(newestTime) : undefined}
		onchange={onDay}
		aria-label="Jump to a date"
		title="Jump to a date, at the selected time of day"
	/>
	<Select.Root type="single" bind:value={preset} onValueChange={onPreset}>
		<Select.Trigger
			class="h-5! gap-1 rounded-md border-none bg-transparent px-1 py-0 text-[10px] text-muted-foreground shadow-none hover:bg-foreground/5 focus-visible:ring-0 focus-visible:ring-offset-0 cursor-pointer [&_svg]:size-3"
			aria-label="Jump back in time"
		>
			Jump back…
		</Select.Trigger>
		<Select.Content
			class="border-none bg-glass/85 shadow-xl ring-1 ring-foreground/10 backdrop-blur-md"
			sideOffset={10}
			align="end"
		>
			{#each PRESETS as { value, label } (value)}
				<Select.Item {value} {label} class="cursor-pointer text-xs">{label}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
</div>
