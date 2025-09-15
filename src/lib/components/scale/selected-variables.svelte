<script lang="ts">
	import type { Domain, Variable } from '$lib/types';

	interface Props {
		domain: Domain;
		variables: Variable[];
	}

	let { domain, variables }: Props = $props();
</script>

<div
	class=" bg-background/90 dark:bg-background/70 absolute bottom-0 left-8 w-[165px] rounded px-2 py-2 text-xs overflow-ellipsis"
>
	<div class=" overflow-hidden">
		<p class="truncate">
			Domain: {domain.label}
		</p>
		<p class="truncate">
			Variables:
			{#each variables as variable}
				{variable.label}
			{/each}
		</p>
	</div>
</div>
