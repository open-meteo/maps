<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import { LEVEL_PREFIX, LEVEL_REGEX, LEVEL_UNIT_REGEX } from '@openmeteo/weather-map-layer';

	import { metaJson } from '$lib/stores/time';

	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';

	import { buildLevelGroups, scrollSelectedToTop } from './selection-utils';

	interface Props {
		/** Variable of the chart source this selector belongs to. */
		sourceVariable: string;
		onSelect: (newVariable: string) => void;
	}

	let { sourceVariable, onSelect }: Props = $props();

	let open = $state(false);

	const levelMatch = $derived(sourceVariable.match(LEVEL_UNIT_REGEX)?.groups);
	const prefix = $derived(
		sourceVariable.match(LEVEL_REGEX)
			? sourceVariable.match(LEVEL_PREFIX)?.groups?.prefix
			: undefined
	);
	const entries = $derived.by(() => {
		if (!prefix || !$metaJson) return undefined;
		const groups = buildLevelGroups($metaJson.variables);
		return groups[prefix]?.filter(
			({ value }) => !value.includes('v_component') && !value.includes('_direction')
		);
	});
</script>

{#if entries?.length && levelMatch}
	<Popover.Root bind:open>
		<Popover.Trigger
			class="hover:bg-primary/15 bg-primary/5 flex h-5 shrink-0 cursor-pointer items-center gap-0.5 rounded-sm px-1 text-[11px] {open
				? 'bg-primary/15'
				: ''}"
			title="Change level"
			aria-expanded={open}
		>
			{levelMatch.level + ' ' + levelMatch.unit}
			<ChevronsUpDownIcon class="size-2.5 opacity-50" />
		</Popover.Trigger>
		<Popover.Content
			align="start"
			onOpenAutoFocus={() => scrollSelectedToTop(sourceVariable)}
			class="z-80 w-55 rounded border-none bg-transparent! p-0"
		>
			<Command.Root class="bg-glass/85! max-h-75 rounded backdrop-blur-sm">
				<Command.Input class="border-none ring-0" placeholder="Search levels..." />
				<Command.List>
					<Command.Empty>No levels found.</Command.Empty>
					<Command.Group>
						{#each entries as { value, label } (value)}
							<Command.Item
								{value}
								keywords={[label]}
								class="hover:bg-primary/20! cursor-pointer {value === sourceVariable
									? 'bg-primary/10!'
									: ''}"
								onSelect={() => {
									if (value !== sourceVariable) onSelect(value);
									open = false;
								}}
							>
								<div class="flex w-full items-center justify-between">
									{label}
									<CheckIcon class="size-4 {value === sourceVariable ? '' : 'text-transparent'}" />
								</div>
							</Command.Item>
						{/each}
					</Command.Group>
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>
{/if}
