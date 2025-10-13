<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';

	import { get } from 'svelte/store';

	import { Button } from '$lib/components/ui/button';

	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';

	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';

	import { variableOptions } from '@openmeteo/mapbox-layer/dist/utils/variables';
	import { domainGroups, domainOptions } from '@openmeteo/mapbox-layer/dist/utils/domains';

	import { onDestroy, onMount } from 'svelte';
	import { browser } from '$app/environment';

	import {
		domainSelectionOpen as dSO,
		variableSelectionOpen as vSO,
		variableSelectionExtended as vSE
	} from '$lib/stores/preferences';

	import type { Map } from 'maplibre-gl';

	import type { Domain, DomainMetaData, Variables } from '$lib/types';
	import { pushState } from '$app/navigation';

	interface Props {
		url: URL;
		map: Map;
		domain: Domain;
		variables: Variables;
		latestRequest: Promise<DomainMetaData>;
		domainChange: (value: string) => Promise<void>;
		variablesChange: (value: string | undefined) => void;
	}

	let { url, map, domain, variables, latestRequest, domainChange, variablesChange }: Props =
		$props();

	let selectedDomain = $derived(domain);
	let selectedVariable = $derived(variables[0]);

	let domainSelectionOpen = $state(get(dSO));
	dSO.subscribe((dO) => {
		domainSelectionOpen = dO;
	});

	let variableSelectionOpen = $state(get(vSO));
	vSO.subscribe((vO) => {
		variableSelectionOpen = vO;
	});

	let variableSelectionExtended = $state(get(vSE));
	vSE.subscribe((vE) => {
		variableSelectionExtended = vE;
		if (url) {
			if (vE) {
				url.searchParams.set('variables-open', 'true');
			} else if (url.searchParams.get('variables-open')) {
				url.searchParams.delete('variables-open');
			}
			pushState(url + map._hash.getHashString(), {});
		}
	});

	const keydownEvent = (event: KeyboardEvent) => {
		if (variableSelectionExtended && !variableSelectionOpen && !domainSelectionOpen) {
			switch (event.key) {
				case 'v':
					vSO.set(true);
					break;
				case 'd':
					dSO.set(true);
					break;
			}
		}
	};

	const desktop = new MediaQuery('min-width: 768px');
	onMount(() => {
		if (desktop.current && typeof get(vSE) === 'undefined') {
			vSE.set(true);
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

<div
	class="absolute top-[10px] flex max-h-[300px] gap-2.5 duration-300 {variableSelectionExtended
		? 'left-2.5'
		: '-left-[182px]'} "
>
	{#await latestRequest}
		<div class="flex flex-col gap-2.5">
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

			<Button
				variant="outline"
				style="box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 0px 2px;"
				class="bg-background/90 dark:bg-background/70 hover:!bg-background h-7.25 w-[180px] cursor-pointer justify-between rounded-[4px] border-none !p-1.5"
				role="combobox"
				aria-expanded={domainSelectionOpen}
			>
				<div class="truncate">Loading variables...</div>
				<ChevronsUpDownIcon class="-ml-2 size-4 shrink-0 opacity-50" />
			</Button>
		</div>
	{:then latest}
		<div class="flex flex-col gap-2.5">
			<Popover.Root
				bind:open={domainSelectionOpen}
				onOpenChange={(e) => {
					dSO.set(e);
				}}
			>
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
						const query = document.querySelector(
							'[data-value=' + selectedDomain.value + ']'
						) as HTMLElement;
						if (query) {
							setTimeout(() => {
								const firstChild = query.querySelector(
									'[data-value=' + selectedDomain.value + ']'
								) as HTMLElement;
								firstChild.scrollIntoView({ block: 'center' });
								firstChild.setAttribute('tabindex', '0');
								firstChild.focus();
							}, 10);
						}
					}}
					class="ml-2.5 w-[250px] rounded-[4px] border-none bg-transparent p-0"
				>
					<Popover.Close
						class="absolute top-0.5 right-0.5 flex h-5 w-5 cursor-pointer items-center justify-center"
						><button aria-label="Close popover"
							><svg
								xmlns="http://www.w3.org/2000/svg"
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="cursor-pointer"
								><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"
								></line></svg
							></button
						></Popover.Close
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
												class="hover:!bg-primary/25 cursor-pointer {selectedDomain.value === value
													? '!bg-primary/15'
													: ''}"
												onSelect={async () => {
													domainChange(value);
													dSO.set(false);
												}}
												aria-selected={selectedDomain.value === value}
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
			<Popover.Root
				bind:open={variableSelectionOpen}
				onOpenChange={(e) => {
					vSO.set(e);
				}}
			>
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
					tabindex={0}
					onOpenAutoFocus={(e) => {
						e.preventDefault();
						const query = document.querySelector(
							'[data-value=' + selectedVariable.value + ']'
						) as HTMLElement;
						if (query) {
							const firstChild = query.querySelector(
								'[data-value=' + selectedVariable.value + ']'
							) as HTMLElement;

							firstChild.scrollIntoView({ block: 'center' });
							firstChild.setAttribute('tabindex', '0');
							firstChild.focus();
						}
					}}
					class="ml-2.5 w-[250px] rounded-[4px] border-none bg-transparent p-0"
				>
					<Popover.Close
						class="absolute top-0.5 right-0.5 flex h-5 w-5 cursor-pointer items-center justify-center"
						><button aria-label="Close popover"
							><svg
								xmlns="http://www.w3.org/2000/svg"
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="cursor-pointer"
								><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"
								></line></svg
							></button
						></Popover.Close
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
											value={v?.value}
											class="hover:!bg-primary/25 cursor-pointer {selectedVariable.value ===
											v?.value
												? '!bg-primary/15'
												: ''}"
											onSelect={() => {
												variablesChange(v?.value);
												vSO.set(false);
											}}
										>
											<div class="flex w-full items-center justify-between">
												{v?.label}
												<CheckIcon
													class="size-4 {selectedVariable.value !== v?.value
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
	{/await}

	<button
		style="box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 0px 2px;"
		class=" bg-background/90 dark:bg-background/70 hover:!bg-background flex h-7.25 w-7.25 cursor-pointer items-center rounded-[4px] p-0"
		onclick={() => {
			vSE.set(!get(vSE));
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
