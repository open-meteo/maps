<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import { domainGroups, domainOptions } from '@openmeteo/weather-map-layer';

	import * as Command from '#lib/components/ui/command/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';

	import { rankedFilter, scrollSelectedToTop } from './selection-utils';

	interface Props {
		/** Domain shown as the current one. */
		selected: string | undefined;
		onSelect: (value: string) => void;
		open?: boolean;
	}

	let { selected, onSelect, open = $bindable(false) }: Props = $props();

	const selectedLabel = $derived(domainOptions.find(({ value }) => value === selected)?.label);

	$effect(() => {
		if (open) scrollSelectedToTop(selected);
	});
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		class="hover:bg-primary/10 flex h-8.5 w-full shrink-0 cursor-pointer items-center justify-between gap-1 rounded px-3 text-sm font-semibold {open
			? 'bg-primary/10'
			: ''}"
		role="combobox"
		aria-expanded={open}
	>
		<div class="truncate">
			{selectedLabel || 'Select a domain...'}
		</div>
		<ChevronsUpDownIcon class="size-4 shrink-0 opacity-50" />
	</Popover.Trigger>
	<Popover.Content align="start" class="bg-transparent! z-80 w-64 rounded border-none! p-0">
		<Command.Root class="bg-glass/85! backdrop-blur-sm max-h-75 rounded" filter={rankedFilter}>
			<Command.Input class="border-none ring-0" placeholder="Search domains..." />
			<Command.List>
				<Command.Empty>No domains found.</Command.Empty>
				{#each domainGroups as { value: group, label: groupLabel } (group)}
					<Command.Group heading={groupLabel}>
						{#each domainOptions as { value, label } (value)}
							{#if value.startsWith(group)}
								<Command.Item
									{value}
									keywords={label ? [label] : undefined}
									class="hover:bg-primary/25! cursor-pointer {selected === value
										? 'bg-primary/10!'
										: ''}"
									onSelect={() => {
										onSelect(value);
										open = false;
									}}
									aria-selected={selected === value}
								>
									<div class="flex w-full items-center justify-between">
										{label}
										<CheckIcon class="size-4 {selected !== value ? 'text-transparent' : ''}" />
									</div>
								</Command.Item>
							{/if}
						{/each}
					</Command.Group>
				{/each}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
