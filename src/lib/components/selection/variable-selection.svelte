<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';

	import { Button } from '$lib/components/ui/button';

	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';

	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';

	import { domainGroups, domainOptions } from '$lib/utils/domains';
	import { variableOptions } from '$lib/utils/variables';

	import type { Domain, DomainMetaData, Variables } from '$lib/types';
	import { onMount } from 'svelte';

	interface Props {
		domain: Domain;
		variables: Variables;
		latestRequest: Promise<DomainMetaData>;
		domainChange: (value: string) => Promise<void>;
		variablesChange: (value: string) => void;
	}
	let { domain, variables, latestRequest, domainChange, variablesChange }: Props = $props();

	let selectedDomain = $derived(domain);
	let selectedVariable = $derived(variables[0]);

	let domainSelectionOpen = $state(false);
	let variableSelectionOpen = $state(false);

	let variableSelectionExtended = $state(false);

	const desktop = new MediaQuery('min-width: 768px');
	onMount(() => {
		if (desktop.current) {
			variableSelectionExtended = true;
		}
	});
</script>

{#await latestRequest}
	<div class="absolute top-2.5 left-2.5 max-h-[300px]"></div>
{:then latest}
	<div
		class="absolute top-2.5 flex max-h-[300px] gap-2.5 duration-300 {variableSelectionExtended
			? 'left-2.5'
			: '-left-[200px]'} "
	>
		<div class="flex flex-col gap-2.5">
			<Popover.Root bind:open={domainSelectionOpen}>
				<Popover.Trigger>
					<Button
						variant="outline"
						class="bg-background/90 dark:bg-background/70 hover:!bg-background w-[200px] cursor-pointer justify-between"
						role="combobox"
						aria-expanded={domainSelectionOpen}
					>
						<div class="truncate">
							{selectedDomain?.label || 'Select a domain...'}
						</div>
						<ChevronsUpDownIcon class="-ml-2 size-4 shrink-0 opacity-50" />
					</Button>
				</Popover.Trigger>
				<Popover.Content class="ml-2.5 w-[250px] bg-transparent p-0">
					<Command.Root autofocus={false}>
						<Command.Input autofocus={false} placeholder="Search variables..." />
						<Command.List>
							<Command.Empty>No domains found.</Command.Empty>
							{#each domainGroups as { value: group, label: groupLabel } (group)}
								<Command.Group heading={groupLabel}>
									{#each domainOptions as { value, label } (value)}
										{#if value.startsWith(group)}
											<Command.Item
												{value}
												class="cursor-pointer"
												onSelect={async () => {
													domainChange(value);
													domainSelectionOpen = false;
												}}
											>
												<div class="flex w-full items-center justify-between">
													{label}
													<CheckIcon
														class="size-4 {selectedDomain.value !== value
															? 'text-transparent'
															: ''}"
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
			<Popover.Root bind:open={variableSelectionOpen}>
				<Popover.Trigger class={domainSelectionOpen ? 'hidden' : ''}>
					<Button
						variant="outline"
						class="bg-background/90 dark:bg-background/70 hover:!bg-background w-[200px] cursor-pointer justify-between"
						role="combobox"
						aria-expanded={variableSelectionOpen}
					>
						<div class="truncate">
							{selectedVariable?.label || 'Select a variable...'}
						</div>
						<ChevronsUpDownIcon class="-ml-2 size-4 shrink-0 opacity-50" />
					</Button>
				</Popover.Trigger>
				<Popover.Content class="ml-2.5 w-[250px] bg-transparent p-0">
					<Command.Root autofocus={false}>
						<Command.Input autofocus={false} placeholder="Search variables..." />
						<Command.List>
							<Command.Empty>No variables found.</Command.Empty>
							<Command.Group>
								{#each latest.variables as vr, i (i)}
									{#if !vr.includes('v_component') && !vr.includes('_direction')}
										{@const v = variableOptions.find((vo) => vo.value === vr)
											? variableOptions.find((vo) => vo.value === vr)
											: { value: vr, label: vr }}

										<Command.Item
											value={v.value}
											class="cursor-pointer"
											onSelect={() => {
												variablesChange(v.value);
												variableSelectionOpen = false;
											}}
										>
											<div class="flex w-full items-center justify-between">
												{v.label}
												<CheckIcon
													class="size-4 {selectedVariable.value !== v.value
														? 'text-transparent'
														: ''}"
												/>
											</div>
										</Command.Item>
									{/if}
								{/each}
							</Command.Group>
						</Command.List>
					</Command.Root>
				</Popover.Content>
			</Popover.Root>
		</div>

		<button
			class="border-border bg-background/90 dark:bg-background/70 hover:!bg-background flex h-9 w-10 cursor-pointer items-center rounded-md border p-0.5"
			onclick={() => {
				variableSelectionExtended = !variableSelectionExtended;
			}}
			aria-label="Hide Variable Selection"
		>
			{#if variableSelectionExtended}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="lucide lucide-chevron-left-icon lucide-chevron-left -mr-0.75"
					><path d="m15 18-6-6 6-6" /></svg
				>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="lucide lucide-chevron-right-icon lucide-chevron-right -mr-0.75"
					><path d="m9 18 6-6-6-6" /></svg
				>
			{/if}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				opacity="0.75"
				stroke-width="1.5"
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="lucide lucide-variable-icon lucide-variable"
				><path d="M8 21s-4-3-4-9 4-9 4-9" /><path d="M16 3s4 3 4 9-4 9-4 9" /><line
					x1="15"
					x2="9"
					y1="9"
					y2="15"
				/><line x1="9" x2="15" y1="9" y2="15" /></svg
			>
		</button>
	</div>
{/await}
