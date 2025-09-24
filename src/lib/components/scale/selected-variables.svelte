<script lang="ts">
	import type { Domain, Variables } from '$lib/types';

	interface Props {
		domain: Domain;
		variables: Variables;
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
			Variable: {variables[0].label}
		</p>
	</div>
</div>
