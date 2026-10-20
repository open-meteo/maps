<script lang="ts">
	import StarIcon from '@lucide/svelte/icons/star';
	import XIcon from '@lucide/svelte/icons/x';

	import {
		type GeoLocation,
		addRecentLocation,
		formatCoordinates,
		locationSearchOpen,
		removeRecentLocation,
		selectedLocation,
		storedFavoriteLocations,
		storedRecentLocations,
		toggleFavoriteLocation
	} from '#lib/stores/location.js';

	import * as Command from '#lib/components/ui/command/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';

	import { clearLocation, setLocation } from '#lib/location.js';

	const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
	// Shorter queries are rejected by the API
	const MIN_QUERY_LENGTH = 2;
	// Waits for a pause in typing before each request
	const DEBOUNCE_MS = 300;

	// The response is untrusted: an error object has no results and any field may be missing
	const isGeoLocation = (value: unknown): value is GeoLocation => {
		if (typeof value !== 'object' || value === null) return false;
		const candidate = value as Record<string, unknown>;
		return (
			typeof candidate.id === 'number' &&
			typeof candidate.name === 'string' &&
			Number.isFinite(candidate.latitude) &&
			Number.isFinite(candidate.longitude)
		);
	};

	let query = $state('');
	/** Undefined until a query ran */
	let results = $state<GeoLocation[] | undefined>(undefined);
	let loading = $state(false);
	let error = $state<string | undefined>(undefined);

	const searching = $derived(query.trim().length >= MIN_QUERY_LENGTH);

	const favoriteIds = $derived(new Set($storedFavoriteLocations.map(({ id }) => id)));
	// Favourites are listed first, so a place in both lists shows once
	const recentToShow = $derived($storedRecentLocations.filter(({ id }) => !favoriteIds.has(id)));

	$effect(() => {
		const name = query.trim();
		if (name.length < MIN_QUERY_LENGTH) {
			results = undefined;
			loading = false;
			error = undefined;
			return;
		}
		loading = true;
		// Typing on cancels the pending request so its response cannot land after a newer one
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const params = new URLSearchParams({ name, count: '10', language: 'en', format: 'json' });
				const response = await fetch(`${GEOCODING_URL}?${params}`, { signal: controller.signal });
				if (!response.ok) throw new Error(`Geocoding request failed (${response.status})`);
				const body = (await response.json()) as { results?: unknown } | null;
				// Without a match the API omits `results` instead of sending an empty list
				results = Array.isArray(body?.results) ? body.results.filter(isGeoLocation) : [];
				error = undefined;
			} catch (caught) {
				if (controller.signal.aborted) return;
				results = [];
				error = caught instanceof Error ? caught.message : String(caught);
			}
			loading = false;
		}, DEBOUNCE_MS);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	// Covers every way of closing: a pick, the remove item, Escape, the overlay
	$effect(() => {
		if (!$locationSearchOpen) query = '';
	});

	const pick = (location: GeoLocation) => {
		addRecentLocation(location);
		setLocation({
			name: location.name,
			latitude: location.latitude,
			longitude: location.longitude
		});
		$locationSearchOpen = false;
	};

	const remove = () => {
		clearLocation();
		$locationSearchOpen = false;
	};

	// Pulled from the shared asset store into static/ (scripts/assets.config.json)
	const flagUrl = ({ country_code }: GeoLocation): string =>
		`/images/country-flags/${(country_code ?? 'united_nations').toLowerCase()}.svg`;

	const detail = (location: GeoLocation): string => {
		const parts = [location.admin1, location.country].filter(Boolean);
		parts.push(formatCoordinates(location));
		if (location.elevation != null) parts.push(`${Math.round(location.elevation)} m`);
		return parts.join(' · ');
	};
</script>

<!-- The star and remove buttons are mouse targets only (tabindex -1): a focused
     button's Enter would fire together with the command list's own Enter select -->
{#snippet locationRow(location: GeoLocation, group: string, removable: boolean)}
	{@const favorite = favoriteIds.has(location.id)}
	<Command.Item
		value="{group}:{location.id}"
		class="hover:bg-primary/20! cursor-pointer"
		onSelect={() => pick(location)}
	>
		<img class="size-6 shrink-0 rounded-full" src={flagUrl(location)} alt="" />
		<div class="min-w-0 flex-1">
			<div class="truncate">{location.name}</div>
			<div class="text-muted-foreground truncate text-xs">{detail(location)}</div>
		</div>
		<button
			type="button"
			tabindex="-1"
			class="group shrink-0 cursor-pointer rounded p-1"
			title={favorite ? 'Remove from favourites' : 'Add to favourites'}
			aria-label={favorite ? 'Remove from favourites' : 'Add to favourites'}
			onclick={(event) => {
				event.stopPropagation();
				toggleFavoriteLocation(location);
			}}
		>
			<StarIcon
				class="size-4 group-hover:text-amber-500 {favorite
					? 'text-amber-500'
					: 'text-muted-foreground/50'}"
				fill={favorite ? 'currentColor' : 'none'}
			/>
		</button>
		{#if removable}
			<button
				type="button"
				tabindex="-1"
				class="group shrink-0 cursor-pointer rounded p-1"
				title="Remove from recent"
				aria-label="Remove {location.name} from recent"
				onclick={(event) => {
					event.stopPropagation();
					removeRecentLocation(location);
				}}
			>
				<XIcon class="text-muted-foreground/50 group-hover:text-destructive size-4" />
			</button>
		{/if}
	</Command.Item>
{/snippet}

<Dialog.Root bind:open={$locationSearchOpen}>
	<Dialog.Content
		class="bg-glass/85! z-100 gap-0 rounded border-none p-0 backdrop-blur-sm sm:max-w-100"
		showCloseButton={false}
	>
		<Dialog.Header class="px-3 pt-2.5">
			<Dialog.Title class="text-sm">Search location</Dialog.Title>
		</Dialog.Header>
		<!-- Results come ranked from the API; cmdk's own filter would re-order and drop them -->
		<Command.Root class="max-h-[min(28rem,70dvh)] bg-transparent!" shouldFilter={false}>
			<Command.Input
				class="border-none ring-0"
				placeholder="Search city or place..."
				bind:value={query}
				autofocus
			/>
			<Command.List class="max-h-full">
				{#if !searching}
					{#if $storedFavoriteLocations.length > 0}
						<Command.Group heading="Favourites">
							{#each $storedFavoriteLocations as location (location.id)}
								{@render locationRow(location, 'favorite', false)}
							{/each}
						</Command.Group>
					{/if}
					{#if recentToShow.length > 0}
						<Command.Group heading="Recent">
							{#each recentToShow as location (location.id)}
								{@render locationRow(location, 'recent', true)}
							{/each}
						</Command.Group>
					{/if}
					{#if $storedFavoriteLocations.length === 0 && recentToShow.length === 0}
						<div class="text-muted-foreground px-2 py-3 text-sm">Type a place name to search.</div>
					{/if}
				{:else if loading}
					<div class="text-muted-foreground px-2 py-3 text-sm">Searching...</div>
				{:else if error}
					<div class="text-destructive px-2 py-3 text-sm">{error}</div>
				{:else if results?.length === 0}
					<div class="text-muted-foreground px-2 py-3 text-sm">
						No locations found for "{query}".
					</div>
				{:else if results?.length}
					<Command.Group>
						{#each results as location (location.id)}
							{@render locationRow(location, 'result', false)}
						{/each}
					</Command.Group>
				{/if}
				{#if $selectedLocation}
					<Command.Group heading="Selected">
						<Command.Item
							value="remove-selected-location"
							class="hover:bg-primary/20! cursor-pointer"
							onSelect={remove}
						>
							<XIcon />
							Remove {$selectedLocation.name ?? formatCoordinates($selectedLocation)}
						</Command.Item>
					</Command.Group>
				{/if}
			</Command.List>
		</Command.Root>
	</Dialog.Content>
</Dialog.Root>
