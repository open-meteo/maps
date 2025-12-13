<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';

	interface Props {
		onReset: () => Promise<void>;
	}

	let { onReset }: Props = $props();
</script>

<div class="mt-auto justify-self-end">
	<h2 class="text-lg font-bold">States</h2>
	<div class="mt-3">
		<Button class="cursor-pointer" onclick={onReset}>Reset all states</Button>
	</div>
</div>
