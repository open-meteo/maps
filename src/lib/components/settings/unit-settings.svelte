<script lang="ts">
	import { toast } from 'svelte-sonner';

	import {
		type PrecipitationUnit,
		type TemperatureUnit,
		type WindSpeedUnit,
		precipitationUnit,
		temperatureUnit,
		windSpeedUnit
	} from '$lib/stores/units';

	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';

	import { refreshPopup } from '$lib/popup';

	const temperatureOptions: { value: TemperatureUnit; label: string }[] = [
		{ value: '°C', label: 'Celsius (°C)' },
		{ value: '°F', label: 'Fahrenheit (°F)' }
	];

	const precipitationOptions: { value: PrecipitationUnit; label: string }[] = [
		{ value: 'mm', label: 'Millimeter (mm)' },
		{ value: 'inch', label: 'Inch (inch)' }
	];

	const windSpeedOptions: { value: WindSpeedUnit; label: string }[] = [
		{ value: 'm/s', label: 'Meter/s (m/s)' },
		{ value: 'km/h', label: 'Kilometer/h (km/h)' },
		{ value: 'mph', label: 'Miles/h (mph)' },
		{ value: 'knots', label: 'Knots (kn)' }
	];

	function getLabel<T extends string>(options: { value: T; label: string }[], value: T): string {
		return options.find((o) => o.value === value)?.label ?? value;
	}
</script>

<div>
	<h2 class="text-lg font-bold">Units</h2>
	<div class="mt-3 flex flex-col gap-3">
		<div class="flex items-center gap-3">
			<Label class="w-28 shrink-0">Temperature</Label>
			<Select.Root
				type="single"
				value={$temperatureUnit}
				onValueChange={(v) => {
					if (v) {
						temperatureUnit.set(v as TemperatureUnit);
						refreshPopup();
						toast.info(`Temperature unit set to ${v}`);
					}
				}}
			>
				<Select.Trigger
					class="h-8 text-sm flex-1 cursor-pointer bg-background/60"
					aria-label="Temperature unit"
				>
					{getLabel(temperatureOptions, $temperatureUnit)}
				</Select.Trigger>
				<Select.Content class="border-none bg-glass/65 backdrop-blur-sm">
					{#each temperatureOptions as { value, label } (value)}
						<Select.Item {value} {label} class="cursor-pointer text-sm" />
					{/each}
				</Select.Content>
			</Select.Root>
		</div>

		<div class="flex items-center gap-3">
			<Label class="w-28 shrink-0">Precipitation</Label>
			<Select.Root
				type="single"
				value={$precipitationUnit}
				onValueChange={(v) => {
					if (v) {
						precipitationUnit.set(v as PrecipitationUnit);
						refreshPopup();
						toast.info(`Precipitation unit set to ${v}`);
					}
				}}
			>
				<Select.Trigger
					class="h-8 text-sm flex-1 cursor-pointer bg-background/60"
					aria-label="Precipitation unit"
				>
					{getLabel(precipitationOptions, $precipitationUnit)}
				</Select.Trigger>
				<Select.Content class="border-none bg-glass/65 backdrop-blur-sm">
					{#each precipitationOptions as { value, label } (value)}
						<Select.Item {value} {label} class="cursor-pointer text-sm" />
					{/each}
				</Select.Content>
			</Select.Root>
		</div>

		<div class="flex items-center gap-3">
			<Label class="w-28 shrink-0">Wind speed</Label>
			<Select.Root
				type="single"
				value={$windSpeedUnit}
				onValueChange={(v) => {
					if (v) {
						windSpeedUnit.set(v as WindSpeedUnit);
						refreshPopup();
						toast.info(`Wind speed unit set to ${v}`);
					}
				}}
			>
				<Select.Trigger
					class="h-8 text-sm flex-1 cursor-pointer bg-background/60"
					aria-label="Wind speed unit"
				>
					{getLabel(windSpeedOptions, $windSpeedUnit)}
				</Select.Trigger>
				<Select.Content class="border-none bg-glass/65 backdrop-blur-sm">
					{#each windSpeedOptions as { value, label } (value)}
						<Select.Item {value} {label} class="cursor-pointer text-sm" />
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	</div>
</div>
