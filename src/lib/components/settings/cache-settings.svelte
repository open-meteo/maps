<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { slide } from 'svelte/transition';

	import { clearBlockCache } from '@openmeteo/weather-map-layer';

	import {
		cacheBlockSizeKb,
		cacheMaxBytesMb,
		getBlockCacheStats,
		gpuCacheMb
	} from '$lib/stores/om-protocol-settings';

	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';

	import { getGpuMemoryUsage } from '$lib/layers';

	import SettingsSection from './settings-section.svelte';

	const blockSizeOptions = [
		{ value: '16', label: '16 KiB' },
		{ value: '32', label: '32 KiB' },
		{ value: '64', label: '64 KiB' },
		{ value: '128', label: '128 KiB' },
		{ value: '256', label: '256 KiB' },
		{ value: '512', label: '512 KiB' }
	];

	const appliedBlockSize = get(cacheBlockSizeKb);
	const appliedMaxBytes = get(cacheMaxBytesMb);
	const appliedGpuCache = get(gpuCacheMb);

	const reload = () => window.location.reload();

	let initialized = false;

	$effect(() => {
		const _blockSize = $cacheBlockSizeKb;
		const _maxBytes = $cacheMaxBytesMb;
		untrack(() => {
			if (initialized) {
				clearBlockCache();
			}
			initialized = true;
		});
	});

	// Live usage of both caches while the pane is open
	const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(0);
	let vram = $state({ bytes: 0, budgetBytes: 0, textures: 0 });
	let ram = $state<
		{ memoryBytes: number; persistentBytes: number; maxBytes: number } | undefined
	>();
	let usageTimer: ReturnType<typeof setInterval> | undefined;
	const pollUsage = async () => {
		vram = getGpuMemoryUsage();
		ram = await getBlockCacheStats();
	};
	onMount(() => {
		pollUsage();
		usageTimer = setInterval(pollUsage, 2000);
	});
	onDestroy(() => clearInterval(usageTimer));
</script>

<SettingsSection title="Cache">
	<div class="mt-3 flex flex-col gap-3">
		<div class="flex items-center gap-3">
			<Label class="w-28 shrink-0">Block Size</Label>
			<Select.Root
				type="single"
				value={String($cacheBlockSizeKb)}
				onValueChange={(v) => {
					if (v) $cacheBlockSizeKb = Number(v);
				}}
			>
				<Select.Trigger class="w-24 bg-background/60" aria-label="Select cache block size">
					{blockSizeOptions.find((o) => o.value === String($cacheBlockSizeKb))?.label ??
						`${$cacheBlockSizeKb} KiB`}
				</Select.Trigger>
				<Select.Content class="z-110 border-none bg-glass/65 backdrop-blur-sm min-w-25">
					{#each blockSizeOptions as option (option.value)}
						<Select.Item value={option.value}>{option.label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
		<div class="flex items-center gap-3">
			<Label for="cache-max-bytes" class="w-28 shrink-0">Max Cache (MB)</Label>
			<Input
				id="cache-max-bytes"
				type="number"
				min={1}
				class="w-24 bg-background/60"
				bind:value={$cacheMaxBytesMb}
			/>
		</div>
		<div class="flex items-center gap-3">
			<Label for="gpu-cache-mb" class="w-28 shrink-0">GPU Cache (MB)</Label>
			<Input
				id="gpu-cache-mb"
				type="number"
				min={64}
				class="w-24 bg-background/60"
				bind:value={$gpuCacheMb}
			/>
		</div>
		<div class="text-xs text-foreground/70 flex flex-col gap-0.5">
			<div>
				VRAM: {mb(vram.bytes)} / {mb(vram.budgetBytes)} MB ({vram.textures} textures)
			</div>
			{#if ram}
				<div>
					RAM: {mb(ram.memoryBytes)} MB in memory, {mb(ram.persistentBytes)} / {mb(ram.maxBytes)} MB stored
				</div>
			{/if}
		</div>
		{#if $cacheBlockSizeKb !== appliedBlockSize || $cacheMaxBytesMb !== appliedMaxBytes || $gpuCacheMb !== appliedGpuCache}
			<div transition:slide>
				<Button class="cursor-pointer self-start" onclick={reload}>Reload to apply</Button>
			</div>
		{/if}
	</div>
</SettingsSection>
