<script lang="ts">
	import { levelGroupVariables } from '@openmeteo/weather-map-layer';

	import { metaJson } from '$lib/stores/time';
	import { variableSelectionOpen as vSO } from '$lib/stores/variables';

	import * as Command from '$lib/components/ui/command';
	import * as Dialog from '$lib/components/ui/dialog';

	import {
		buildLevelGroups,
		buildVariableList,
		pickDefaultLevel,
		variableLabel
	} from './selection-utils';

	interface Props {
		/** Receives the picked variable (chart editor "add variable" flow). */
		onPick?: (variable: string) => void;
	}

	let { onPick = undefined }: Props = $props();

	let open = $state(false);
	vSO.subscribe((value) => (open = value));

	const variableList = $derived($metaJson ? buildVariableList($metaJson.variables) : []);
	const levelGroups = $derived($metaJson ? buildLevelGroups($metaJson.variables) : {});

	const selectEntry = (entry: string) => {
		let target = entry;
		if (levelGroupVariables.includes(entry) && levelGroups[entry]) {
			const level = pickDefaultLevel(levelGroups[entry]);
			if (!level) return;
			target = level;
		}
		onPick?.(target);
		vSO.set(false);
	};
</script>

<Dialog.Root bind:open onOpenChange={(value) => vSO.set(value)}>
	<Dialog.Content
		class="bg-glass/85! z-100 gap-0 rounded border-none p-0 backdrop-blur-sm sm:max-w-100"
		showCloseButton={false}
	>
		<Dialog.Header class="px-3 pt-2.5">
			<Dialog.Title class="text-sm">Add variable to chart</Dialog.Title>
		</Dialog.Header>
		<Command.Root class="max-h-[min(28rem,70dvh)] bg-transparent!">
			<Command.Input class="border-none ring-0" placeholder="Search variables..." autofocus />
			<Command.List class="max-h-full">
				<Command.Empty>No variables found.</Command.Empty>
				<Command.Group>
					{#each variableList as entry (entry)}
						{#if levelGroupVariables.includes(entry) || (!entry.includes('_v_') && !entry.includes('_direction'))}
							<Command.Item
								value={entry}
								keywords={[variableLabel(entry)]}
								class="hover:bg-primary/20! cursor-pointer"
								onSelect={() => selectEntry(entry)}
							>
								{variableLabel(entry)}
							</Command.Item>
						{/if}
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Dialog.Content>
</Dialog.Root>
