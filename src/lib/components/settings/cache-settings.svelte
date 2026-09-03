<script lang="ts">
	import { untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { slide } from 'svelte/transition';

	import { clearBlockCache } from '@openmeteo/weather-map-layer';

	import { cacheBlockSizeKb, cacheMaxBytesMb } from '$lib/stores/om-protocol-settings';
	import {
		DAILY_REQUEST_LIMIT,
		type EndpointMode,
		HOURLY_REQUEST_LIMIT,
		MINUTELY_REQUEST_LIMIT,
		apiRequestCounter,
		endpointChoice,
		setEndpointMode,
		slowEndpoint,
		utcDay,
		utcHour,
		utcMinute
	} from '$lib/stores/request-counter';

	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';

	import { BASE_URI, SLOW_BASE_URI } from '$lib/helpers';

	const endpointOptions: { value: EndpointMode; label: string }[] = [
		{ value: 'default', label: new URL(BASE_URI).host },
		{ value: 's3', label: new URL(SLOW_BASE_URI).host },
		{ value: 'custom', label: 'Custom' }
	];

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
</script>

<div>
	<h2 class="text-lg font-bold">Cache</h2>
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
			<Label class="w-28 shrink-0">Data endpoint</Label>
			<Select.Root
				type="single"
				value={$endpointChoice.mode}
				onValueChange={(v) => {
					if (v) setEndpointMode(v as EndpointMode);
				}}
			>
				<Select.Trigger class="flex-1 min-w-0 bg-background/60" aria-label="Select data endpoint">
					{endpointOptions.find((o) => o.value === $endpointChoice.mode)?.label}
				</Select.Trigger>
				<Select.Content class="z-110 border-none bg-glass/65 backdrop-blur-sm min-w-25">
					{#each endpointOptions as option (option.value)}
						<Select.Item value={option.value}>{option.label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
		{#if $endpointChoice.mode === 'custom'}
			<div class="flex items-center gap-3" transition:slide>
				<Label for="custom-endpoint" class="w-28 shrink-0">Custom URI</Label>
				<Input
					id="custom-endpoint"
					type="text"
					placeholder="https://host/data_spatial"
					class="flex-1 bg-background/60"
					bind:value={$endpointChoice.customUri}
				/>
			</div>
		{/if}
		<div class="text-xs text-foreground/70 flex flex-col gap-0.5">
			<div>
				API requests: {($apiRequestCounter.minute === utcMinute()
					? $apiRequestCounter.minuteCount
					: 0
				).toLocaleString()} / {MINUTELY_REQUEST_LIMIT.toLocaleString()} minute · {($apiRequestCounter.hour ===
				utcHour()
					? $apiRequestCounter.hourCount
					: 0
				).toLocaleString()} / {HOURLY_REQUEST_LIMIT.toLocaleString()} hour · {($apiRequestCounter.day ===
				utcDay()
					? $apiRequestCounter.count
					: 0
				).toLocaleString()} / {DAILY_REQUEST_LIMIT.toLocaleString()} today
			</div>
			{#if $slowEndpoint.activeUntil > Date.now()}
				<div>
					Auto-switched to the S3 endpoint until {new Date(
						$slowEndpoint.activeUntil
					).toLocaleTimeString()}
				</div>
			{/if}
		</div>
		{#if $cacheBlockSizeKb !== appliedBlockSize || $cacheMaxBytesMb !== appliedMaxBytes}
			<div transition:slide>
				<Button class="cursor-pointer self-start" onclick={reload}>Reload to apply</Button>
			</div>
		{/if}
	</div>
</div>
