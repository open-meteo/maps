<script lang="ts">
	import { get } from 'svelte/store';
	import { slide } from 'svelte/transition';

	import { cacheBlockSizeKb, cacheMaxBytesMb } from '$lib/stores/om-protocol-settings';

	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	const appliedBlockSize = get(cacheBlockSizeKb);
	const appliedMaxBytes = get(cacheMaxBytesMb);

	const reload = () => window.location.reload();
</script>

<div>
	<h2 class="text-lg font-bold">Cache</h2>
	<div class="mt-3 flex flex-col gap-3">
		<div class="flex items-center gap-3">
			<Label for="cache-block-size" class="w-28 shrink-0">Block Size (KB)</Label>
			<Input
				id="cache-block-size"
				type="number"
				min={1}
				class="w-24"
				bind:value={$cacheBlockSizeKb}
			/>
		</div>
		<div class="flex items-center gap-3">
			<Label for="cache-max-bytes" class="w-28 shrink-0">Max Cache (MB)</Label>
			<Input
				id="cache-max-bytes"
				type="number"
				min={1}
				class="w-24"
				bind:value={$cacheMaxBytesMb}
			/>
		</div>
		{#if $cacheBlockSizeKb !== appliedBlockSize || $cacheMaxBytesMb !== appliedMaxBytes}
			<div transition:slide>
				<Button class="cursor-pointer self-start" onclick={reload}>Reload to apply</Button>
			</div>
		{/if}
	</div>
</div>
