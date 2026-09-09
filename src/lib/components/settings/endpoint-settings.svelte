<script lang="ts">
	import { slide } from 'svelte/transition';

	import {
		DAILY_REQUEST_LIMIT,
		type EndpointMode,
		HOURLY_REQUEST_LIMIT,
		MINUTELY_REQUEST_LIMIT,
		apiRequestCounter,
		endpointChoice,
		rateLimitOptions,
		s3Fallback,
		setEndpointMode,
		utcDay,
		utcHour,
		utcMinute
	} from '$lib/stores/request-counter';

	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';

	import { BASE_URI, DATA_SPATIAL_BASE_URI, S3_BASE_URI } from '$lib/helpers';

	import SettingsSection from './settings-section.svelte';

	// The known endpoints, skipping whichever one BASE_URI already is (in dev a
	// VITE_DATA_BASE_URI override can point the default at S3 or localhost).
	const endpointOptions: { value: EndpointMode; label: string }[] = [
		{ value: 'default' as EndpointMode, label: new URL(BASE_URI).host },
		{ value: 'data-spatial' as EndpointMode, label: new URL(DATA_SPATIAL_BASE_URI).host },
		{ value: 's3' as EndpointMode, label: new URL(S3_BASE_URI).host },
		{ value: 'custom' as EndpointMode, label: 'Custom' }
	].filter((option, i) => i === 0 || option.label !== new URL(BASE_URI).host);
</script>

<SettingsSection title="Data endpoint">
	<div class="mt-3 flex flex-col gap-3">
		<Select.Root
			type="single"
			value={$endpointChoice.mode}
			onValueChange={(v) => {
				if (v) setEndpointMode(v as EndpointMode);
			}}
		>
			<Select.Trigger class="w-full bg-background/60" aria-label="Select data endpoint">
				{endpointOptions.find((o) => o.value === $endpointChoice.mode)?.label ??
					new URL(BASE_URI).host}
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
		<div class="flex gap-3">
			<Switch
				id="rate-limit-auto-switch"
				class="cursor-pointer"
				bind:checked={$rateLimitOptions.autoSwitch}
			/>
			<Label for="rate-limit-auto-switch" class="cursor-pointer">
				Switch to S3 automatically when rate limited
			</Label>
		</div>
		<div class="flex gap-3">
			<Switch
				id="rate-limit-notifications"
				class="cursor-pointer"
				bind:checked={$rateLimitOptions.notifications}
			/>
			<Label for="rate-limit-notifications" class="cursor-pointer">Rate limit notifications</Label>
		</div>
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
</SettingsSection>
