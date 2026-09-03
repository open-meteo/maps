<script lang="ts">
	import { slide } from 'svelte/transition';

	import {
		DAILY_REQUEST_LIMIT,
		type EndpointMode,
		HOURLY_REQUEST_LIMIT,
		MINUTELY_REQUEST_LIMIT,
		apiRequestCounter,
		endpointChoice,
		s3Fallback,
		setEndpointMode,
		utcDay,
		utcHour,
		utcMinute
	} from '$lib/stores/request-counter';

	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';

	import { BASE_URI, S3_BASE_URI } from '$lib/helpers';

	const endpointOptions: { value: EndpointMode; label: string }[] = [
		{ value: 'default', label: new URL(BASE_URI).host },
		{ value: 's3', label: new URL(S3_BASE_URI).host },
		{ value: 'custom', label: 'Custom' }
	];
</script>

<div>
	<h2 class="text-lg font-bold">Data endpoint</h2>
	<div class="mt-3 flex flex-col gap-3">
		<Select.Root
			type="single"
			value={$endpointChoice.mode}
			onValueChange={(v) => {
				if (v) setEndpointMode(v as EndpointMode);
			}}
		>
			<Select.Trigger class="w-full bg-background/60" aria-label="Select data endpoint">
				{endpointOptions.find((o) => o.value === $endpointChoice.mode)?.label}
			</Select.Trigger>
			<Select.Content class="z-110 border-none bg-glass/65 backdrop-blur-sm min-w-25">
				{#each endpointOptions as option (option.value)}
					<Select.Item value={option.value}>{option.label}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
		{#if $endpointChoice.mode === 'custom'}
			<div class="flex flex-col gap-1.5" transition:slide>
				<Label for="custom-endpoint">Custom URI</Label>
				<Input
					id="custom-endpoint"
					type="text"
					placeholder="https://host/data_spatial"
					class="w-full bg-background/60"
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
			{#if $s3Fallback.activeUntil > Date.now()}
				<div>
					Auto-switched to the S3 endpoint until {new Date(
						$s3Fallback.activeUntil
					).toLocaleTimeString()}
				</div>
			{/if}
		</div>
	</div>
</div>
