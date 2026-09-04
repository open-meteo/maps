<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import { LEVEL_UNIT_REGEX } from '@openmeteo/weather-map-layer';

	import { setPlainVariable } from '$lib/stores/chart';
	import {
		level,
		levelGroupSelected,
		pressureLevelsSelectionOpen as pLSO,
		unit,
		variable
	} from '$lib/stores/variables';

	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';

	import { isStandaloneVariable, levelGroups, scrollSelectedToTop } from './selection-utils';

	interface Props {
		/** Rendered inside the popular list, under its active row. */
		nested?: boolean;
	}

	let { nested = false }: Props = $props();

	$effect(() => {
		if ($pLSO) scrollSelectedToTop($variable);
	});

	const entries = $derived(
		$levelGroupSelected ? $levelGroups[$levelGroupSelected.value] : undefined
	);
	const usableEntries = $derived(entries?.filter(({ value }) => isStandaloneVariable(value)));
</script>

{#if usableEntries && usableEntries.length > 1}
	<Popover.Root bind:open={$pLSO}>
		<Popover.Trigger
			class="hover:bg-primary/15 flex w-full cursor-pointer items-center justify-between gap-1 text-sm {$pLSO
				? 'bg-primary/15'
				: ''} {nested ? 'bg-primary/5 h-7 py-0.5 pr-3 pl-6' : 'h-7.5 px-3'}"
			role="combobox"
			data-level-select
			aria-expanded={$pLSO}
		>
			<div class="flex items-center gap-2 truncate">
				<span class="text-muted-foreground text-xs">Level</span>
				{$level && $unit ? `${$level} ${$unit}` : 'Select a level...'}
			</div>
			<ChevronsUpDownIcon class="size-4 shrink-0 opacity-50" />
		</Popover.Trigger>
		<Popover.Content align="start" class="z-80 bg-transparent! w-64 rounded border-none p-0">
			<Command.Root class="bg-glass/85! max-h-75 rounded backdrop-blur-sm">
				<Command.Input class="border-none ring-0" placeholder="Search levels..." />
				<Command.List>
					<Command.Empty>No levels found.</Command.Empty>
					<Command.Group>
						{#each usableEntries as { value, label } (value)}
							{@const lvl = value.match(LEVEL_UNIT_REGEX)?.groups?.level}
							{@const u = value.match(LEVEL_UNIT_REGEX)?.groups?.unit}
							<Command.Item
								{value}
								keywords={[label]}
								class="hover:bg-primary/20! cursor-pointer {lvl === $level && u === $unit
									? 'bg-primary/10!'
									: ''}"
								onSelect={() => {
									setPlainVariable(value);
									pLSO.set(false);
								}}
							>
								<div class="flex w-full items-center justify-between">
									{label}
									<CheckIcon
										class="size-4 {lvl !== $level || u !== $unit ? 'text-transparent' : ''}"
									/>
								</div>
							</Command.Item>
						{/each}
					</Command.Group>
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>
{/if}
