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
	import { onDestroy, onMount } from 'svelte';
	import { browser } from '$app/environment';

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

	const keydownEvent = (event: KeyboardEvent) => {
		if (!variableSelectionOpen && !domainSelectionOpen) {
			switch (event.key) {
				case 'v':
					variableSelectionOpen = true;
					break;
				case 'd':
					domainSelectionOpen = true;
					break;
			}
		}
	};

	const desktop = new MediaQuery('min-width: 768px');
	onMount(() => {
		if (desktop.current) {
			variableSelectionExtended = true;
		}

		if (browser) {
			window.addEventListener('keydown', keydownEvent);
		}
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('keydown', keydownEvent);
		}
	});
</script>

{#await latestRequest}
	<div class="absolute top-2.5 left-2.5 max-h-[300px]"></div>
{:then latest}
	<div
		class="absolute top-[10px] flex max-h-[300px] gap-2.5 duration-300 {variableSelectionExtended
			? 'left-2.5'
			: '-left-[182px]'} "
	>
		<div class="flex flex-col gap-2.5">
			<Popover.Root bind:open={domainSelectionOpen}>
				<Popover.Trigger>
					<Button
						variant="outline"
						style="box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 0px 2px;"
						class="bg-background/90 dark:bg-background/70 hover:!bg-background h-7.25 w-[180px] cursor-pointer justify-between rounded-[4px] border-none !p-1.5"
						role="combobox"
						aria-expanded={domainSelectionOpen}
					>
						<div class="truncate">
							{selectedDomain?.label || 'Select a domain...'}
						</div>
						<ChevronsUpDownIcon class="-ml-2 size-4 shrink-0 opacity-50" />
					</Button>
				</Popover.Trigger>
				<Popover.Content
					onOpenAutoFocus={(e) => {
						e.preventDefault();
					}}
					class="ml-2.5 w-[250px] rounded-[4px] border-none bg-transparent p-0"
				>
					<Command.Root
						style="box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 0px 2px;"
						class="rounded-[3px]"
					>
						<Command.Input placeholder="Search domains..." />
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
						style="box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 0px 2px;"
						class="bg-background/90 dark:bg-background/70 hover:!bg-background h-7.25 w-[180px] cursor-pointer justify-between rounded-[4px] border-none !p-1.5"
						role="combobox"
						aria-expanded={variableSelectionOpen}
					>
						<div class="truncate">
							{selectedVariable?.label || 'Select a variable...'}
						</div>
						<ChevronsUpDownIcon class="-ml-2 size-4 shrink-0 opacity-50" />
					</Button>
				</Popover.Trigger>
				<Popover.Content
					onOpenAutoFocus={(e) => {
						e.preventDefault();
					}}
					class="ml-2.5 w-[250px] rounded-[4px] border-none bg-transparent p-0"
				>
					<Command.Root
						style="box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 0px 2px;"
						class="rounded-[3px]"
					>
						<Command.Input placeholder="Search variables..." />
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
			style="box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 0px 2px;"
			class=" bg-background/90 dark:bg-background/70 hover:!bg-background flex h-7.25 w-7.25 cursor-pointer items-center rounded-[4px] p-0"
			onclick={() => {
				variableSelectionExtended = !variableSelectionExtended;
			}}
			aria-label="Hide Variable Selection"
		>
			{#if variableSelectionExtended}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="17"
					height="17"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="lucide lucide-chevron-left-icon lucide-chevron-left -mr-1.25"
					><path d="m15 18-6-6 6-6" /></svg
				>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="17"
					height="17"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="lucide lucide-chevron-right-icon lucide-chevron-right -mr-1.25"
					><path d="m9 18 6-6-6-6" /></svg
				>
			{/if}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				opacity="0.75"
				stroke-width="1.75"
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
