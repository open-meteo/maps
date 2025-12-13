<script lang="ts">
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';

	import { selectedDomain, selectedVariable } from '$lib/stores/variables';

	import { Button } from '$lib/components/ui/button';
</script>

<div class="flex flex-col gap-2.5">
	<Button
		variant="outline"
		style="box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 0px 2px;"
		class="bg-background/90 dark:bg-background/70 hover:!bg-background h-7.25 w-[180px] cursor-pointer justify-between rounded-[4px] border-none !p-1.5"
		role="combobox"
	>
		<div class="truncate">
			{$selectedDomain?.label || 'Select a domain...'}
		</div>
		<ChevronsUpDownIcon class="-ml-2 size-4 shrink-0 opacity-50" />
	</Button>

	<Button
		variant="outline"
		style="box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 0px 2px;"
		class="bg-background/90 dark:bg-background/70 hover:!bg-background h-7.25 w-[180px] cursor-pointer justify-between rounded-[4px] border-none !p-1.5"
		role="combobox"
	>
		<div class="truncate">{$selectedVariable?.label || 'Select a domain...'}</div>
		<ChevronsUpDownIcon class="-ml-2 size-4 shrink-0 opacity-50" />
	</Button>
</div>
