<script lang="ts">
	import { GridFactory } from '@openmeteo/weather-map-layer';

	import { selectedDomain } from '$lib/stores/variables';

	import { gridBench, median, showGridBench } from '$lib/bench';

	const stats = $derived($gridBench[$selectedDomain.value]);
	const grid = $derived($selectedDomain.grid);

	// geometry fetched from outside the bundle (the cell index), re-read whenever
	// a timing arrives since the buffer registers asynchronously; the analytical
	// ICON grid decodes a bundled table instead
	const geometryBytes = $derived(
		stats
			? GridFactory.sharedBuffers(grid).reduce((sum, { buffer }) => sum + buffer.byteLength, 0)
			: 0
	);

	const ms = (value: number | undefined) => (value === undefined ? '–' : `${value.toFixed(0)} ms`);
	const geometry = $derived(
		grid.type === 'latband'
			? geometryBytes
				? `${(geometryBytes / 1e6).toFixed(1)} MB`
				: 'loading'
			: grid.type === 'icon'
				? 'bundled table'
				: 'none'
	);
</script>

{#if $showGridBench}
	<div
		data-bench
		class="bg-glass/80 pointer-events-none fixed top-2 left-1/2 z-50 -translate-x-1/2 rounded px-3 py-1.5 font-mono text-xs whitespace-nowrap backdrop-blur-sm"
	>
		<div>{$selectedDomain.label} · {grid.type}</div>
		<div>geometry {geometry} · {ms(stats?.geometryMs)}</div>
		<div>
			tiles with data load {stats?.loadCount ?? 0} · median {ms(median(stats?.loadMs ?? []))}
		</div>
		<div>
			tiles after load {stats?.renderCount ?? 0} · median {ms(median(stats?.renderMs ?? []))} · last {ms(
				stats?.renderMs.at(-1)
			)}
		</div>
		<div>popup {ms(stats?.popupMs)}</div>
	</div>
{/if}
