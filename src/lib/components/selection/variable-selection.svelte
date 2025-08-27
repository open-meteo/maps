<script lang="ts">
	import { pad } from '$lib/utils/pad';

	import { domainGroups, domains } from '$lib/utils/domains';
	import { variables } from '$lib/utils/variables';

	import { Button } from '$lib/components/ui/button';

	import * as Select from '$lib/components/ui/select';

	import type { Domain, Variable } from '$lib/types';

	interface Props {
		domain: Domain;
		variable: Variable;
		modelRuns;
		timeSelected: Date;
		latestRequest;
		domainChange: Function;
		variableChange: Function;
		progressRequest;
		modelRunChange: Function;
		modelRunSelected: Date;
	}
	let {
		domain,
		variable,
		modelRuns,
		timeSelected,
		latestRequest,
		domainChange,
		variableChange,
		progressRequest,
		modelRunChange,
		modelRunSelected
	}: Props = $props();

	let selectedDomain = $derived(domain.value);
	let selectedVariable = $derived(variable.value);

	const timeValid = $derived.by(async () => {
		let latest = await latestRequest;
		for (let vt of latest.valid_times) {
			let d = new Date(vt);
			if (timeSelected - d == 0) {
				return true;
			}
		}
		return false;
	});
</script>

<div class="mt-3 flex w-full flex-col flex-wrap gap-6 sm:flex-row sm:gap-0">
	<div class="flex flex-col gap-3 sm:w-1/2 md:w-1/3 md:pr-3">
		<h2 class="text-lg font-bold">Domains</h2>
		<div class="relative">
			<Select.Root
				name="domains"
				type="single"
				bind:value={selectedDomain}
				onValueChange={(value) => {
					domainChange(value);
				}}
			>
				<Select.Trigger aria-label="Domain trigger" class="top-[0.35rem] !h-12 w-full  pt-6 "
					>{domain?.label}</Select.Trigger
				>
				<Select.Content side="bottom">
					{#each domainGroups as { value: group, label: groupLabel } (group)}
						<Select.Group>
							<Select.GroupHeading>{groupLabel}</Select.GroupHeading>
							{#each domains as { value, label } (value)}
								{#if value.startsWith(group)}
									<Select.Item {value}>{label}</Select.Item>
								{/if}
							{/each}
						</Select.Group>
					{/each}
				</Select.Content>
				<Select.Label class="absolute top-0 left-2 z-10 px-1 text-xs">Domain</Select.Label>
			</Select.Root>
		</div>
	</div>

	{#await latestRequest}
		<div class="flex flex-col gap-1 sm:w-1/2 md:w-1/3 md:px-3">
			<h2 class="mb-2 text-lg font-bold">Model runs</h2>
			Loading latest model runs...
		</div>

		<div class="flex flex-col gap-1 sm:w-1/2 md:w-1/3 md:pl-3">
			<h2 class="mb-2 text-lg font-bold">Variables</h2>
			Loading domain variables...
		</div>
	{:then latest}
		<div class="flex flex-col gap-1 sm:w-1/2 md:w-1/3 md:px-3">
			<h2 class="mb-2 text-lg font-bold">Model runs</h2>
			{#each modelRuns as mr, i (i)}
				<Button
					class="cursor-pointer bg-blue-200 hover:bg-blue-600 {mr.getTime() ===
					modelRunSelected.getTime()
						? 'bg-blue-400'
						: ''}"
					onclick={() => {
						modelRunChange(mr);
					}}
					>{mr.getUTCFullYear() +
						'-' +
						pad(mr.getUTCMonth() + 1) +
						'-' +
						pad(mr.getUTCDate()) +
						' ' +
						pad(mr.getUTCHours()) +
						':' +
						pad(mr.getUTCMinutes())}</Button
				>
			{/each}
			{#await progressRequest then progress}
				{#if progress.completed !== true}
					<h2 class="mt-4 mb-2 text-lg font-bold">In progress</h2>

					{@const ip = new Date(progress.reference_time)}
					<Button
						class="cursor-pointer bg-blue-200 hover:bg-blue-600 {ip.getTime() ===
						modelRunSelected.getTime()
							? 'bg-blue-400'
							: ''}"
						onclick={() => {
							modelRunSelected = ip;
							url.searchParams.set('model', ip.toISOString().replace(/[:Z]/g, '').slice(0, 15));
							pushState(url + map._hash.getHashString(), {});
							toast(
								'Model run set to: ' +
									ip.getUTCFullYear() +
									'-' +
									pad(ip.getUTCMonth() + 1) +
									'-' +
									pad(ip.getUTCDate()) +
									' ' +
									pad(ip.getUTCHours()) +
									':' +
									pad(ip.getUTCMinutes())
							);
							changeOMfileURL();
						}}
						>{ip.getUTCFullYear() +
							'-' +
							pad(ip.getUTCMonth() + 1) +
							'-' +
							pad(ip.getUTCDate()) +
							' ' +
							pad(ip.getUTCHours()) +
							':' +
							pad(ip.getUTCMinutes())}</Button
					>
				{/if}
			{/await}
		</div>
		{#if timeValid}
			<div class="flex flex-col gap-1 sm:w-1/2 md:w-1/3 md:pl-3">
				<h2 class="mb-2 text-lg font-bold">Variables</h2>

				<div class="relative">
					<Select.Root
						name="variables"
						type="single"
						bind:value={selectedVariable}
						onValueChange={(value) => {
							variableChange(value);
						}}
					>
						<Select.Trigger aria-label="Domain trigger" class="top-[0.35rem] !h-12 w-full  pt-6 "
							>{variable?.label}</Select.Trigger
						>
						<Select.Content side="bottom">
							{#each latest.variables as vr, i (i)}
								{#if !vr.startsWith('wind_') || vr === 'wind_gusts_10m'}
									{@const v = variables.find((vrb) => vrb.value === vr)
										? variables.find((vrb) => vrb.value === vr)
										: { value: vr, label: vr }}

									<Select.Item value={v.value}>{v.label}</Select.Item>
								{/if}
							{/each}
						</Select.Content>
						<Select.Label class="absolute top-0 left-2 z-10 px-1 text-xs">Variable</Select.Label>
					</Select.Root>
				</div>
			</div>
		{:else}
			<div class="flex min-w-1/4 flex-col gap-1">No valid time selected</div>
		{/if}
	{/await}
</div>
