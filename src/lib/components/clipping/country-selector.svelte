<script lang="ts">
	import { fade } from 'svelte/transition';

	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';

	import { clippingCountryCodes } from '$lib/stores/clipping';
	import { typing } from '$lib/stores/preferences';

	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';

	import { type Country, countryList, loadCountryGeoJson } from './country-data';

	export type { Country };

	interface Props {
		onselect?: (countries: Country[]) => void;
	}

	let { onselect }: Props = $props();

	let open = $state(false);
	let searchValue = $state('');
	let loadingGeojson = $state(false);
	let selectionRequestId = 0;

	$effect(() => {
		typing.set(open);
	});

	$effect(() => {
		if (!onselect) return;
		const requestId = ++selectionRequestId;
		if ($clippingCountryCodes.length === 0) {
			onselect([]);
			return;
		}
		(async () => {
			const selectedWithGeojson = await Promise.all(
				selectedCountryObjs.map((c) => loadCountryGeoJsonWithState(c))
			);
			if (requestId !== selectionRequestId) return;
			onselect?.(selectedWithGeojson);
		})();
	});

	// Map of country names/codes to their GeoJSON filenames is in country-data.ts

	// Filter countries based on search input
	const filteredCountries = $derived.by(() => {
		const search = searchValue.toLowerCase();
		return countryList.filter(
			(country) =>
				country.name.toLowerCase().includes(search) || country.code.toLowerCase().includes(search)
		);
	});

	// Get the selected country objects
	const selectedCountryObjs = $derived.by(() => {
		return countryList.filter((c) => $clippingCountryCodes.includes(c.code));
	});

	// Calculate the total number of actual countries (deduplicated by filename)
	const totalCountriesCount = $derived.by(() => {
		const uniqueFiles = new Set<string>();
		for (const country of selectedCountryObjs) {
			if (country.filenames && country.filenames.length > 0) {
				for (const filename of country.filenames) {
					uniqueFiles.add(filename);
				}
			} else if (country.filename) {
				uniqueFiles.add(country.filename);
			}
		}
		return uniqueFiles.size;
	});

	// Helper to check if a country is selected
	function isSelected(countryCode: string): boolean {
		return $clippingCountryCodes.includes(countryCode);
	}

	async function loadCountryGeoJsonWithState(country: Country): Promise<Country> {
		loadingGeojson = true;
		try {
			return await loadCountryGeoJson(country);
		} finally {
			loadingGeojson = false;
		}
	}

	async function handleSelect(country: Country) {
		const index = $clippingCountryCodes.indexOf(country.code);
		if (index > -1) {
			$clippingCountryCodes = $clippingCountryCodes.filter((code) => code !== country.code);
		} else {
			$clippingCountryCodes = [...$clippingCountryCodes, country.code];
		}
	}

	export const clearAll = () => {
		$clippingCountryCodes = [];
		searchValue = '';
	};
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		<Button
			variant="outline"
			class="bg-glass/75 dark:bg-glass/75 backdrop-blur-sm shadow-md {open
				? 'bg-glass/95!'
				: ''} hover:bg-glass/95! border-none h-7.25 w-48 cursor-pointer justify-between rounded p-1.5!"
			role="combobox"
			aria-expanded={open}
		>
			<div class="truncate">
				{#if $clippingCountryCodes.length === 0}
					Clip: Select countries...
				{:else if totalCountriesCount === 1}
					Clip: {selectedCountryObjs[0]?.name}
				{:else}
					Clip: {totalCountriesCount} countries
				{/if}
			</div>
			<ChevronsUpDownIcon class="-ml-2 size-4 shrink-0 opacity-50" />
		</Button>
	</Popover.Trigger>
	<Popover.Content class="bg-transparent! mt-3 mr-11 ml-2.5 w-62.5 rounded border-none! p-0">
		<Command.Root class="bg-glass/85! backdrop-blur-sm rounded" shouldFilter={false}>
			<div class="flex flex-col gap-1 bg-transparent">
				<div class="flex items-center gap-2">
					<Command.Input
						class="flex-1 border-none ring-0"
						placeholder="Search countries..."
						bind:value={searchValue}
					/>
					{#if searchValue.length > 0}
						<button
							transition:fade
							onclick={() => (searchValue = '')}
							class="px-2 py-1 bg-none absolute right-2 top-1 cursor-pointer text-sm rounded text-muted-foreground hover:text-foreground transition-colors"
						>
							Clear
						</button>
					{/if}
				</div>
				{#if $clippingCountryCodes.length > 0}
					<div class="flex items-center justify-between px-3 py-1 text-xs border-t border-muted/50">
						<span class="text-muted-foreground">{totalCountriesCount} selected</span>
						<button
							onclick={clearAll}
							class="px-2 py-0.5 cursor-pointer hover:bg-muted/80 rounded text-muted-foreground hover:text-foreground transition-colors"
						>
							Clear All
						</button>
					</div>
				{/if}
			</div>
			<Command.List>
				<Command.Empty>No country found.</Command.Empty>
				<Command.Group>
					{#each filteredCountries as country (country.code)}
						<Command.Item
							value={`${country.name} ${country.code}`}
							onSelect={() => handleSelect(country)}
							class="cursor-pointer"
						>
							<span class="truncate">{country.name}</span>
							<span class="ml-auto text-xs text-muted-foreground text-nowrap">{country.code}</span>
							<CheckIcon
								class={`mr-2 h-4 w-4 ${isSelected(country.code) ? 'opacity-100' : 'opacity-0'}`}
							/>
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
