<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';

	import { type NativeGridSource, nativeGridSource } from '$lib/domains';

	import SettingsSection from './settings-section.svelte';

	const sources: { value: NativeGridSource; label: string }[] = [
		{ value: 'analytical', label: 'Analytical' },
		{ value: 'file', label: 'Cell index' }
	];

	let source = $derived($nativeGridSource);

	// The domain list is built once at startup and the protocol keeps the grid of
	// every loaded state, so the page restarts with the new geometry.
	const setSource = (value: NativeGridSource) => {
		nativeGridSource.set(value);
		window.location.reload();
	};
</script>

<SettingsSection title="Native ICON grid">
	<p class="mt-1 text-sm opacity-75">
		Geometry of the global native ICON domain: the analytical icosahedral grid with its warp table,
		or the backend's cell index (grid.bin, 65 MB fetched once), the same lookup the API uses.
		Changing it reloads the page.
	</p>
	<div class="mt-3 flex flex-wrap gap-3">
		{#each sources as item (item.value)}
			<Button
				class="min-w-24 cursor-pointer {source === item.value ? 'bg-primary' : 'bg-primary/75'}"
				onclick={() => setSource(item.value)}>{item.label}</Button
			>
		{/each}
	</div>
</SettingsSection>
