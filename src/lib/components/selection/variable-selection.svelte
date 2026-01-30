<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { get } from 'svelte/store';

	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import {
		LEVEL_PREFIX,
		LEVEL_REGEX,
		LEVEL_UNIT_REGEX,
		domainGroups,
		domainOptions,
		levelGroupVariables,
		variableOptions
	} from '@openmeteo/mapbox-layer';
	import { toast } from 'svelte-sonner';

	import { browser } from '$app/environment';

	import { desktop, loading, metaJson, typing } from '$lib/stores/preferences';
	import {
		domainSelectionOpen as dSO,
		domain,
		level,
		levelGroupSelected,
		pressureLevelsSelectionOpen as pLSO,
		selectedDomain,
		selectedVariable,
		unit,
		variableSelectionExtended as vSE,
		variableSelectionOpen as vSO,
		variable
	} from '$lib/stores/variables';

	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';

	import VariableSelectionEmpty from './variable-selection-empty.svelte';

	// list of variables, with the level groups filtered out, and adding a prefix for the group
	let variableList = $derived.by(() => {
		if ($metaJson) {
			const variables: string[] = [];
			for (let mjVariable of $metaJson.variables) {
				let match = mjVariable.match(LEVEL_REGEX);
				if (match) {
					const prefixMatch = mjVariable.match(LEVEL_PREFIX);
					const prefix = prefixMatch?.groups?.prefix;
					if (prefix) {
						if (!variables.includes(prefix)) variables.push(prefix);
						continue;
					}
				}

				variables.push(mjVariable);
			}
			return variables;
		}
	});

	const levelGroupsList = $derived.by(() => {
		if ($metaJson) {
			const groups: { [key: string]: [{ value: string; label: string }] } = {};
			for (let mjVariable of $metaJson.variables) {
				let match = mjVariable.match(LEVEL_REGEX);
				if (match && match.groups) {
					const prefixMatch = mjVariable.match(LEVEL_PREFIX);
					const prefix = prefixMatch?.groups?.prefix;

					if (prefix) {
						let variableObject = variableOptions.find(({ value }) => value === mjVariable) ?? {
							value: mjVariable,
							label: mjVariable
						};
						if (!Object.keys(groups).includes(prefix)) {
							groups[prefix] = [variableObject];
						} else {
							groups[prefix].push(variableObject);
						}
					}
				}
			}
			return groups;
		}
	});

	let domainSelectionOpen = $state(get(dSO));
	dSO.subscribe((dO) => {
		domainSelectionOpen = dO;
	});

	let variableSelectionOpen = $state(get(vSO));
	vSO.subscribe((vO) => {
		variableSelectionOpen = vO;
	});

	let pressureLevelSelectionOpen = $state(get(pLSO));
	pLSO.subscribe((plO) => {
		pressureLevelSelectionOpen = plO;
	});

	let variableSelectionExtended = $state(get(vSE));
	vSE.subscribe((vE) => {
		variableSelectionExtended = vE;
	});

	let ctrl = $state(false);
	const keyDownEvent = (event: KeyboardEvent) => {
		if ($typing) return;
		if (event.keyCode == 17 || event.keyCode == 91) ctrl = true;
		if (
			variableSelectionExtended &&
			!variableSelectionOpen &&
			!domainSelectionOpen &&
			!pressureLevelSelectionOpen
		) {
			switch (event.key) {
				case 'v':
					if (!ctrl) vSO.set(true);
					break;
				case 'd':
					if (!ctrl) dSO.set(true);
					break;
				case 'l':
					if (!ctrl) pLSO.set(true);
					break;
				case 'Escape':
					toast.dismiss();
					break;
			}
		}
	};
	const keyUpEvent = (event: KeyboardEvent) => {
		if (event.keyCode == 17 || event.keyCode == 91) ctrl = false;
	};

	onMount(() => {
		if (desktop.current && typeof get(vSE) === 'undefined') {
			vSE.set(true);
		}

		if (browser) {
			window.addEventListener('keydown', keyDownEvent);
			window.addEventListener('keyup', keyUpEvent);
		}
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('keydown', keyDownEvent);
			window.removeEventListener('keyup', keyUpEvent);
		}
	});

	const checkDefaultLevel = (value: string) => {
		if (levelGroupsList && $levelGroupSelected) {
			const levelGroup = levelGroupsList[$levelGroupSelected.value];
			if (levelGroup) {
				// define some default levels
				for (let level of levelGroup) {
					if (level.value.includes('2m')) {
						return level.value;
					} else if (level.value.includes('10m')) {
						return level.value;
					} else if (level.value.includes('100m')) {
						return level.value;
					}
				}
				return levelGroup[0].value;
			}
		}
		return value;
	};
</script>

<div
	class="absolute top-2.5 flex max-h-75 gap-2.5 z-30 duration-300 {variableSelectionExtended
		? 'left-2.5'
		: '-left-45.5'} "
>
	{#if $loading || !$metaJson}
		<VariableSelectionEmpty />
	{:else}
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
							{$selectedDomain?.label || 'Select a domain...'}
						</div>
						<ChevronsUpDownIcon class="-ml-2 size-4 shrink-0 opacity-50" />
					</Button>
				</Popover.Trigger>
				<Popover.Content
					onOpenAutoFocus={(e) => {
						e.preventDefault();
						const query = document.querySelector(
							'[data-value=' + $selectedDomain.value + ']'
						) as HTMLElement;
						if (query) {
							setTimeout(() => {
								const firstChild = query.querySelector(
									'[data-value=' + $selectedDomain.value + ']'
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
						class="absolute right-0.5 top-0.5 flex h-5 w-5 cursor-pointer items-center justify-center"
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
												class="hover:bg-primary/25! cursor-pointer {$selectedDomain.value === value
													? 'bg-primary/15!'
													: ''}"
												onSelect={() => {
													$loading = true;
													$domain = value;
													dSO.set(false);
												}}
												aria-selected={$selectedDomain.value === value}
											>
												<div class="flex w-full items-center justify-between">
													{label}
													<CheckIcon
														class="size-4 {$selectedDomain.value !== value
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
						class="bg-background/90 dark:bg-background/70 hover:bg-background! h-7.25 w-[180px] cursor-pointer justify-between rounded-[4px] border-none !p-1.5"
						role="combobox"
						aria-expanded={variableSelectionOpen}
					>
						<div class="truncate">
							{$levelGroupSelected
								? $levelGroupSelected?.label
								: $selectedVariable?.label || 'Select a variable...'}
						</div>
						<ChevronsUpDownIcon class="-ml-2 size-4 shrink-0 opacity-50" />
					</Button>
				</Popover.Trigger>
				<Popover.Content
					tabindex={0}
					onOpenAutoFocus={(e) => {
						e.preventDefault();
						const query = document.querySelector(
							'[data-value=' + $selectedVariable.value + ']'
						) as HTMLElement;
						if (query) {
							const firstChild = query.querySelector(
								'[data-value=' + $selectedVariable.value + ']'
							) as HTMLElement;

							firstChild.scrollIntoView({ block: 'center' });
							firstChild.setAttribute('tabindex', '0');
							firstChild.focus();
						}
					}}
					class="ml-2.5 w-[250px] rounded-[4px] border-none bg-transparent p-0"
				>
					<Popover.Close
						class="absolute right-0.5 top-0.5 flex h-5 w-5 cursor-pointer items-center justify-center"
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
								{#each variableList as vr, i (i)}
									{@const v = variableOptions.find(({ value }) => value === vr)
										? variableOptions.find(({ value }) => value === vr)
										: { value: vr, label: vr }}
									{#if levelGroupVariables.includes(vr)}
										<Command.Item
											value={v?.value}
											class="hover:!bg-primary/25 cursor-pointer {$levelGroupSelected &&
											$levelGroupSelected.value === v?.value
												? '!bg-primary/15'
												: ''}"
											onSelect={() => {
												$levelGroupSelected = v;
												$variable = checkDefaultLevel(v?.value as string);
												vSO.set(false);
											}}
										>
											<div class="flex w-full items-center justify-between">
												{v?.label}
												<CheckIcon
													class="size-4 {!$levelGroupSelected ||
													$levelGroupSelected?.value !== v?.value
														? 'text-transparent'
														: ''}"
												/>
											</div>
										</Command.Item>
									{:else if !vr.includes('_v_') && !vr.includes('_direction')}
										{@const v = variableOptions.find(({ value }) => value === vr)
											? variableOptions.find(({ value }) => value === vr)
											: { value: vr, label: vr }}

										<Command.Item
											value={v?.value}
											class="hover:!bg-primary/25 cursor-pointer {$selectedVariable.value ===
											v?.value
												? '!bg-primary/15'
												: ''}"
											onSelect={() => {
												$levelGroupSelected = undefined;
												$variable = v?.value as string;
												vSO.set(false);
											}}
										>
											<div class="flex w-full items-center justify-between">
												{v?.label}
												<CheckIcon
													class="size-4 {$selectedVariable.value !== v?.value
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
			{#if levelGroupsList && $levelGroupSelected && $levelGroupSelected?.value && levelGroupsList[$levelGroupSelected.value]}
				<Popover.Root
					bind:open={pressureLevelSelectionOpen}
					onOpenChange={(e) => {
						pLSO.set(e);
					}}
				>
					<Popover.Trigger class={domainSelectionOpen || variableSelectionOpen ? 'hidden' : ''}>
						<Button
							variant="outline"
							style="box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 0px 2px;"
							class="bg-background/90 dark:bg-background/70 hover:!bg-background h-7.25 w-[180px] cursor-pointer justify-between rounded-[4px] border-none !p-1.5"
							role="combobox"
							aria-expanded={pressureLevelSelectionOpen}
						>
							<div class="truncate">
								{$level + ' ' + $unit || 'Select a level...'}
							</div>
							<ChevronsUpDownIcon class="-ml-2 size-4 shrink-0 opacity-50" />
						</Button>
					</Popover.Trigger>
					<Popover.Content
						tabindex={0}
						class="ml-2.5 w-[250px] rounded-[4px] border-none bg-transparent p-0"
					>
						<Popover.Close
							class="absolute right-0.5 top-0.5 flex h-5 w-5 cursor-pointer items-center justify-center"
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
							<Command.Input placeholder="Search levels..." />
							<Command.List>
								<Command.Empty>No levels found.</Command.Empty>
								<Command.Group>
									{#each levelGroupsList[$levelGroupSelected.value] as { value, label } (value)}
										{@const lvl = value.match(LEVEL_UNIT_REGEX)?.groups?.level}
										{@const u = value.match(LEVEL_UNIT_REGEX)?.groups?.unit}

										{#if !value.includes('v_component') && !value.includes('_direction')}
											<Command.Item
												{value}
												class="hover:!bg-primary/25 cursor-pointer {lvl === $level && u === $unit
													? '!bg-primary/15'
													: ''}"
												onSelect={() => {
													$variable = value;
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
										{/if}
									{/each}
								</Command.Group>
							</Command.List>
						</Command.Root>
					</Popover.Content>
				</Popover.Root>
			{/if}
		</div>
	{/if}

	<button
		style="box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 0px 2px;"
		class="bg-background/90 dark:bg-background/70 hover:!bg-background h-7.25 w-7.25 flex cursor-pointer items-center rounded-[4px] p-0 z-20"
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
