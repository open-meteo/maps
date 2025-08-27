<script lang="ts">
	import type { Domain, Variable } from '$lib/types';

	interface Props {
		domain: Domain;
		variable: Variable;
	}

	let { domain, variable }: Props = $props();
</script>

<div
	class=" bg-background/50 absolute bottom-0 left-8 w-[165px] rounded px-2 py-2 text-xs overflow-ellipsis"
>
	<div class=" overflow-hidden">
		<p class="truncate">
			Domain: {domain.label}
		</p>
		<p class="truncate">
			Variable: {variable.label}
		</p>
	</div>
</div>
