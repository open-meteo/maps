<script lang="ts">
	import { fade } from 'svelte/transition';

	import { type GridLoadProgress, domainOptions } from '@openmeteo/weather-map-layer';

	interface Props {
		/** The grids still loading (see the grid-loading store). */
		loads: GridLoadProgress[];
	}

	let { loads }: Props = $props();

	// A patch of ICON-like mesh: one triangle split into ROWS² cells, coloured
	// in from the apex as the file downloads, then rippling while the mesh is
	// built. Rows run from cold to warm like a temperature scale.
	const ROWS = 6;
	const SIDE = 20;
	const HEIGHT = (SIDE * Math.sqrt(3)) / 2;
	const PAD = 4;
	const WIDTH = ROWS * SIDE + 2 * PAD;
	const CENTRE = WIDTH / 2;

	const cells = Array.from({ length: ROWS }, (_, row) => {
		const top = PAD + row * HEIGHT;
		const bottom = top + HEIGHT;
		const topLeft = CENTRE - (row * SIDE) / 2;
		const bottomLeft = CENTRE - ((row + 1) * SIDE) / 2;
		const hue = 205 - (180 * row) / (ROWS - 1);
		return Array.from({ length: 2 * row + 1 }, (_, k) => {
			const j = Math.floor(k / 2);
			const corners =
				k % 2 === 0
					? [
							[bottomLeft + j * SIDE, bottom],
							[bottomLeft + (j + 1) * SIDE, bottom],
							[topLeft + j * SIDE, top]
						]
					: [
							[topLeft + j * SIDE, top],
							[topLeft + (j + 1) * SIDE, top],
							[bottomLeft + (j + 1) * SIDE, bottom]
						];
			return {
				points: corners.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' '),
				colour: `hsl(${hue} 80% 55%)`,
				// a sweep from the apex towards the base, slanting left to right
				delay: (row + k / 4) / ROWS
			};
		});
	}).flat();

	const label = $derived(
		domainOptions.find(({ grid }) => grid.type === 'latband' && grid.geometry === loads[0]?.url)
			?.label ?? 'ICON'
	);
	const downloads = $derived(loads.filter(({ phase }) => phase === 'download'));
	const building = $derived(downloads.length === 0);
	const loaded = $derived(downloads.reduce((sum, { loaded }) => sum + loaded, 0));
	const total = $derived(
		downloads.every(({ total }) => total > 0)
			? downloads.reduce((sum, { total }) => sum + total, 0)
			: 0
	);
	const filled = $derived(
		building ? cells.length : total > 0 ? Math.floor((cells.length * loaded) / total) : 0
	);

	const megabytes = (bytes: number) => (bytes / 1e6).toFixed(1);
</script>

<div
	in:fade={{ delay: 300, duration: 300 }}
	out:fade={{ duration: 200 }}
	class="pointer-events-none absolute top-[50%] left-[50%] z-90 flex transform-[translate(-50%,-50%)] flex-col items-center gap-3 rounded-lg bg-glass/80 px-6 py-5 shadow-xl backdrop-blur-sm"
	role="status"
	aria-live="polite"
>
	<svg
		class="mesh"
		class:building
		width={WIDTH}
		height={ROWS * HEIGHT + 2 * PAD}
		viewBox="0 0 {WIDTH} {ROWS * HEIGHT + 2 * PAD}"
		aria-hidden="true"
	>
		{#each cells as cell, i (i)}
			<polygon
				points={cell.points}
				fill={cell.colour}
				fill-opacity={i < filled ? 1 : 0.12}
				style:animation-delay="{cell.delay}s"
			/>
		{/each}
	</svg>
	<div class="flex flex-col items-center text-center">
		<span class="text-sm font-medium">{label} grid</span>
		<span class="text-xs text-muted-foreground tabular-nums">
			{#if building}
				Building the triangle mesh…
			{:else if total > 0}
				Downloading · {megabytes(loaded)} / {megabytes(total)} MB
			{:else}
				Downloading · {megabytes(loaded)} MB
			{/if}
		</span>
	</div>
</div>

<style>
	.mesh polygon {
		stroke: var(--glass);
		stroke-width: 1.5;
		stroke-linejoin: round;
		transition: fill-opacity 200ms ease-out;
	}

	.mesh.building polygon {
		animation: ripple 1.4s ease-in-out infinite;
	}

	@keyframes ripple {
		0%,
		100% {
			fill-opacity: 1;
		}
		50% {
			fill-opacity: 0.3;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.mesh polygon {
			transition: none;
		}

		.mesh.building polygon {
			animation: none;
		}
	}
</style>
