<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	import { getBlockCacheStats } from '$lib/stores/om-protocol-settings';
	import { DAILY_REQUEST_LIMIT, apiRequestCounter, utcDay } from '$lib/stores/request-counter';

	import { getGpuMemoryUsage } from '$lib/layers';

	let vram = $state({ bytes: 0, budgetBytes: 1 });
	let ram = $state({ persistentBytes: 0, maxBytes: 1 });
	const requests = $derived($apiRequestCounter.day === utcDay() ? $apiRequestCounter.count : 0);

	const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(0);
	const pct = (part: number, whole: number) => Math.min(100, (100 * part) / Math.max(1, whole));

	let timer: ReturnType<typeof setInterval> | undefined;
	const poll = async () => {
		vram = getGpuMemoryUsage();
		const stats = await getBlockCacheStats();
		if (stats) ram = stats;
	};
	onMount(() => {
		poll();
		timer = setInterval(poll, 2000);
	});
	onDestroy(() => clearInterval(timer));
</script>

<!-- Fill of the GPU texture cache (top), the data block cache (middle) and the daily API request budget (bottom) -->
<div
	class="flex flex-col justify-center gap-0.75 w-9 h-4.5 pr-0.5"
	title={`VRAM ${mb(vram.bytes)} / ${mb(vram.budgetBytes)} MB · RAM ${mb(ram.persistentBytes)} / ${mb(ram.maxBytes)} MB · API ${requests.toLocaleString()} / ${DAILY_REQUEST_LIMIT.toLocaleString()} requests today`}
>
	<div class="h-1 rounded-full bg-foreground/15 overflow-hidden">
		<div class="h-full bg-blue-500/80" style="width: {pct(vram.bytes, vram.budgetBytes)}%"></div>
	</div>
	<div class="h-1 rounded-full bg-foreground/15 overflow-hidden">
		<div
			class="h-full bg-amber-500/80"
			style="width: {pct(ram.persistentBytes, ram.maxBytes)}%"
		></div>
	</div>
	<div class="h-1 rounded-full bg-foreground/15 overflow-hidden">
		<div
			class="h-full {requests >= DAILY_REQUEST_LIMIT ? 'bg-red-500/80' : 'bg-emerald-500/80'}"
			style="width: {pct(requests, DAILY_REQUEST_LIMIT)}%"
		></div>
	</div>
</div>
