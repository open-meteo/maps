<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import { domainGroups, domainOptions } from '@openmeteo/weather-map-layer';

	import { domainSelectionOpen as dSO, domain, selectedDomain } from '$lib/stores/variables';

	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';

	import { scrollSelectedToTop } from './selection-utils';

	$effect(() => {
		if ($dSO) scrollSelectedToTop($selectedDomain.value);
	});
</script>

<Popover.Root bind:open={$dSO}>
	<Popover.Trigger
		class="hover:bg-primary/10 flex h-8.5 w-full shrink-0 cursor-pointer items-center justify-between gap-1 rounded-t px-3 text-sm font-semibold {$dSO
			? 'bg-primary/10'
			: ''}"
		role="combobox"
		aria-expanded={$dSO}
	>
		<div class="truncate">
			{$selectedDomain?.label || 'Select a domain...'}
		</div>
		<ChevronsUpDownIcon class="size-4 shrink-0 opacity-50" />
	</Popover.Trigger>
	<Popover.Content align="start" class="bg-transparent! z-80 w-64 rounded border-none! p-0">
		<Command.Root class="bg-glass/85! backdrop-blur-sm max-h-75 rounded">
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
									class="hover:bg-primary/25! cursor-pointer {$selectedDomain.value === value
										? 'bg-primary/10!'
										: ''}"
									onSelect={() => {
										$domain = value;
										dSO.set(false);
									}}
									aria-selected={$selectedDomain.value === value}
								>
									<div class="flex w-full items-center justify-between">
										{label}
										<CheckIcon
											class="size-4 {$selectedDomain.value !== value ? 'text-transparent' : ''}"
										/>
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
