<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	import { IconGrid, IconGridAnalytical, IconGridGeometric } from '@openmeteo/weather-map-layer';
	import * as maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';

	import { getStyle } from '$lib/map-controls';

	// Debug view for the native ICON R3B07 grid (issue #278): draws a selectable
	// grid implementation next to the actual DWD grid (vertices + topology
	// extracted from icon_grid_0026_R03B07_G.nc, served by
	// icon-native-test/serve.mjs) plus the centre displacement, so the residual
	// vs the operational grid can be inspected per solution:
	//   - warp table   (IconGrid):           ~35 m mean / 0.53 km max
	//   - polynomial   (IconGridAnalytical): ~0.75 km mean / ~1.7 km max
	//   - geometric    (IconGridGeometric):  ~21 km mean / 65 km max (raw)

	const DATA_BASE = 'http://localhost:8090/grid-viz';
	const N = 2949120;
	const MAX_CELLS = 9000; // ~zoom 6+; more gets slow and unreadable
	const R_KM = 6371.229;

	const gridData = { type: 'icon', nx: N, ny: 1, iconRoot: 3, iconBisections: 7 } as const;
	const SOLUTIONS = {
		table: {
			label: 'warp table — IconGrid (~35 m)',
			grid: new IconGrid(gridData),
			// displacement colour ramp stops (km): green → yellow → red
			ramp: [0, 0.25, 0.5]
		},
		analytical: {
			label: 'polynomial — IconGridAnalytical (~0.75 km)',
			grid: new IconGridAnalytical(gridData),
			ramp: [0, 1, 2]
		},
		geometric: {
			label: 'pure geometric — IconGridGeometric (~21 km)',
			grid: new IconGridGeometric(gridData),
			ramp: [0, 30, 65]
		}
	};
	type SolutionKey = keyof typeof SOLUTIONS;

	let mapContainer: HTMLElement;
	let map: maplibregl.Map | undefined;
	let loadError = $state('');
	let loading = $state(true);
	let tooManyCells = $state(false);
	let stats = $state({ cells: 0, meanKm: 0, maxKm: 0 });
	let solution = $state<SolutionKey>('table');
	let showSolution = $state(true);
	let showActual = $state(true);
	let showDisplacement = $state(true);

	// actual grid data (radians), fetched once
	let clat: Float32Array;
	let clon: Float32Array;
	let vlat: Float32Array;
	let vlon: Float32Array;
	let vertexOfCell: Int32Array; // layout [3, N], 1-based

	const rad2deg = 180 / Math.PI;
	const deg2rad = Math.PI / 180;

	// note: no generic arrow function here — svelte's TS stripping drops the
	// runtime parameters of `async <T extends ...>(...)` along with the types
	const fetchBuffer = async (name: string): Promise<ArrayBuffer> => {
		const r = await fetch(`${DATA_BASE}/${name}`);
		if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
		return r.arrayBuffer();
	};

	const gcDistKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
		const a =
			Math.sin(((lat2 - lat1) * deg2rad) / 2) ** 2 +
			Math.cos(lat1 * deg2rad) *
				Math.cos(lat2 * deg2rad) *
				Math.sin(((lon2 - lon1) * deg2rad) / 2) ** 2;
		return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
	};

	// unwrap a longitude to the copy nearest to ref (antimeridian-safe drawing)
	const unwrap = (lon: number, ref: number) => lon - 360 * Math.round((lon - ref) / 360);

	// neighbour of a cell across the great-circle edge (a, b): reflect the cell
	// centre across the edge plane and locate the resulting point
	const neighborAcross = (
		grid: IconGrid | IconGridAnalytical | IconGridGeometric,
		center: { lat: number; lon: number },
		a: { lat: number; lon: number },
		b: { lat: number; lon: number }
	): number => {
		const vec = (p: { lat: number; lon: number }) => {
			const la = p.lat * deg2rad;
			const lo = p.lon * deg2rad;
			return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
		};
		const va = vec(a);
		const vb = vec(b);
		const vc = vec(center);
		let nx = va[1] * vb[2] - va[2] * vb[1];
		let ny = va[2] * vb[0] - va[0] * vb[2];
		let nz = va[0] * vb[1] - va[1] * vb[0];
		const nl = Math.hypot(nx, ny, nz);
		nx /= nl;
		ny /= nl;
		nz /= nl;
		const d = 2 * (vc[0] * nx + vc[1] * ny + vc[2] * nz);
		const rx = vc[0] - d * nx;
		const ry = vc[1] - d * ny;
		const rz = vc[2] - d * nz;
		return grid.findCell(Math.asin(rz) * rad2deg, Math.atan2(ry, rx) * rad2deg);
	};

	// cells whose centre lies in the padded view box, found by BFS over
	// edge-neighbours starting from the view centre (index numbering matches
	// the actual grid, so the same set indexes both meshes)
	const visibleCells = (
		grid: IconGrid | IconGridAnalytical | IconGridGeometric,
		bounds: maplibregl.LngLatBounds,
		centerCell: number
	): number[] => {
		const west = bounds.getWest();
		const east = bounds.getEast();
		const south = Math.max(-90, bounds.getSouth() - 0.3);
		const north = Math.min(90, bounds.getNorth() + 0.3);
		const lonRef = (west + east) / 2;
		const lonHalf = (east - west) / 2 + 0.3;
		const inBox = (lat: number, lon: number) =>
			lat >= south && lat <= north && Math.abs(unwrap(lon, lonRef) - lonRef) <= lonHalf;

		const found: number[] = [];
		// plain algorithmic scratch state, never rendered — reactivity unwanted
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const visited = new Set<number>([centerCell]);
		const queue = [centerCell];
		while (queue.length && visited.size < MAX_CELLS * 3) {
			const cell = queue.shift()!;
			const center = grid.cellCoordinates(cell);
			if (!inBox(center.lat, center.lon)) continue;
			found.push(cell);
			const verts = grid.cellVertices(cell);
			for (let e = 0; e < 3; e++) {
				const nb = neighborAcross(grid, center, verts[e], verts[(e + 1) % 3]);
				if (!visited.has(nb)) {
					visited.add(nb);
					queue.push(nb);
				}
			}
		}
		return found;
	};

	const triangleRing = (
		points: { lat: number; lon: number }[],
		lonRef: number
	): [number, number][] => {
		const lon0 = unwrap(points[0].lon, lonRef);
		const ring: [number, number][] = [[lon0, points[0].lat]];
		for (let i = 1; i < 3; i++) ring.push([unwrap(points[i].lon, lon0), points[i].lat]);
		ring.push(ring[0]);
		return ring;
	};

	const update = () => {
		if (!map || !clat) return;
		const grid = SOLUTIONS[solution].grid;
		const bounds = map.getBounds();
		// expected cell count from the view's solid angle
		const area =
			(bounds.getEast() - bounds.getWest()) *
			deg2rad *
			(Math.sin(bounds.getNorth() * deg2rad) - Math.sin(bounds.getSouth() * deg2rad));
		if ((area / ((4 * Math.PI) / N)) * 1.2 > MAX_CELLS) {
			tooManyCells = true;
			for (const s of ['solution-mesh', 'actual-mesh', 'displacement', 'true-centers']) {
				(map.getSource(s) as maplibregl.GeoJSONSource)?.setData({
					type: 'FeatureCollection',
					features: []
				});
			}
			stats = { cells: 0, meanKm: 0, maxKm: 0 };
			return;
		}
		tooManyCells = false;

		const c = map.getCenter();
		const cells = visibleCells(grid, bounds, grid.findCell(c.lat, c.lng));
		const lonRef = c.lng;

		const solutionMesh: GeoJSON.Feature[] = [];
		const actual: GeoJSON.Feature[] = [];
		const displacement: GeoJSON.Feature[] = [];
		const centers: GeoJSON.Feature[] = [];
		let sum = 0;
		let max = 0;
		for (const cell of cells) {
			solutionMesh.push({
				type: 'Feature',
				properties: {},
				geometry: { type: 'LineString', coordinates: triangleRing(grid.cellVertices(cell), lonRef) }
			});
			const trueTri = [0, 1, 2].map((v) => {
				const vi = vertexOfCell[v * N + cell] - 1;
				return { lat: vlat[vi] * rad2deg, lon: vlon[vi] * rad2deg };
			});
			actual.push({
				type: 'Feature',
				properties: {},
				geometry: { type: 'LineString', coordinates: triangleRing(trueTri, lonRef) }
			});
			const ana = grid.cellCoordinates(cell);
			const tLat = clat[cell] * rad2deg;
			const tLon = clon[cell] * rad2deg;
			const km = gcDistKm(ana.lat, ana.lon, tLat, tLon);
			sum += km;
			if (km > max) max = km;
			const anaLon = unwrap(ana.lon, lonRef);
			displacement.push({
				type: 'Feature',
				properties: { km },
				geometry: {
					type: 'LineString',
					coordinates: [
						[anaLon, ana.lat],
						[unwrap(tLon, anaLon), tLat]
					]
				}
			});
			centers.push({
				type: 'Feature',
				properties: { km },
				geometry: { type: 'Point', coordinates: [unwrap(tLon, lonRef), tLat] }
			});
		}
		stats = { cells: cells.length, meanKm: sum / (cells.length || 1), maxKm: max };

		const set = (id: string, features: GeoJSON.Feature[]) =>
			(map!.getSource(id) as maplibregl.GeoJSONSource)?.setData({
				type: 'FeatureCollection',
				features
			});
		set('solution-mesh', solutionMesh);
		set('actual-mesh', actual);
		set('displacement', displacement);
		set('true-centers', centers);
	};

	const setVisibility = () => {
		if (!map?.getLayer('solution-mesh')) return;
		map.setLayoutProperty('solution-mesh', 'visibility', showSolution ? 'visible' : 'none');
		map.setLayoutProperty('actual-mesh', 'visibility', showActual ? 'visible' : 'none');
		const dis = showDisplacement ? 'visible' : 'none';
		map.setLayoutProperty('displacement', 'visibility', dis);
		map.setLayoutProperty('true-centers', 'visibility', dis);
	};

	const setDisplacementRamp = () => {
		if (!map?.getLayer('displacement')) return;
		const ramp = SOLUTIONS[solution].ramp;
		map.setPaintProperty('displacement', 'line-color', [
			'interpolate',
			['linear'],
			['get', 'km'],
			ramp[0],
			'#22c55e',
			ramp[1],
			'#eab308',
			ramp[2],
			'#dc2626'
		]);
	};

	$effect(() => {
		void showSolution;
		void showActual;
		void showDisplacement;
		setVisibility();
	});

	$effect(() => {
		void solution;
		setDisplacementRamp();
		update();
	});

	onMount(async () => {
		try {
			const [clatBuf, clonBuf, vlatBuf, vlonBuf, vocBuf] = await Promise.all([
				fetchBuffer('clat_r3b7.f32'),
				fetchBuffer('clon_r3b7.f32'),
				fetchBuffer('vlat_r3b7.f32'),
				fetchBuffer('vlon_r3b7.f32'),
				fetchBuffer('vertex_of_cell_r3b7.i32')
			]);
			clat = new Float32Array(clatBuf);
			clon = new Float32Array(clonBuf);
			vlat = new Float32Array(vlatBuf);
			vlon = new Float32Array(vlonBuf);
			vertexOfCell = new Int32Array(vocBuf);
		} catch (e) {
			loadError = `Failed to load grid data from ${DATA_BASE} — is icon-native-test/serve.mjs running? (${e})`;
			loading = false;
			return;
		}

		map = new maplibregl.Map({
			container: mapContainer,
			style: await getStyle(),
			center: [8.5, 47.3],
			zoom: 7,
			maxPitch: 0
		});
		map.on('load', () => {
			const lineLayer = (
				id: string,
				color: string,
				width: number
			): maplibregl.LayerSpecification => {
				map!.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
				return {
					id,
					type: 'line',
					source: id,
					paint: { 'line-color': color, 'line-width': width, 'line-opacity': 0.85 }
				};
			};
			map!.addLayer(lineLayer('solution-mesh', '#2563eb', 1.2));
			map!.addLayer(lineLayer('actual-mesh', '#dc2626', 1.2));
			map!.addLayer(lineLayer('displacement', '#111', 2));
			map!.addSource('true-centers', {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: [] }
			});
			map!.addLayer({
				id: 'true-centers',
				type: 'circle',
				source: 'true-centers',
				paint: { 'circle-radius': 2.5, 'circle-color': '#dc2626' }
			});
			loading = false;
			setDisplacementRamp();
			update();
			setVisibility();
		});
		map.on('moveend', update);
	});

	onDestroy(() => map?.remove());
</script>

<svelte:head>
	<title>ICON grid compare — implementations vs actual</title>
</svelte:head>

<div class="page">
	<div class="map" bind:this={mapContainer}></div>
	<div class="panel">
		<h1>ICON R3B07: implementations vs actual</h1>
		<select bind:value={solution}>
			{#each Object.entries(SOLUTIONS) as [key, s] (key)}
				<option value={key}>{s.label}</option>
			{/each}
		</select>
		<label
			><input type="checkbox" bind:checked={showSolution} /> <span class="swatch blue"></span> selected
			implementation</label
		>
		<label
			><input type="checkbox" bind:checked={showActual} /> <span class="swatch red"></span> actual grid
			(icon_grid_0026)</label
		>
		<label
			><input type="checkbox" bind:checked={showDisplacement} />
			<span class="swatch gradient"></span> centre displacement</label
		>
		{#if loading}
			<p>loading grid data (~70 MB, one-off)…</p>
		{:else if loadError}
			<p class="error">{loadError}</p>
		{:else if tooManyCells}
			<p>zoom in (≥ ~z6) to draw the grids</p>
		{:else}
			<p>
				{stats.cells} cells — deviation mean {stats.meanKm < 1
					? `${(stats.meanKm * 1000).toFixed(0)} m`
					: `${stats.meanKm.toFixed(1)} km`}, max
				{stats.maxKm < 1 ? `${(stats.maxKm * 1000).toFixed(0)} m` : `${stats.maxKm.toFixed(1)} km`}
			</p>
		{/if}
		<p class="hint">
			displacement colour: <span style="color:#22c55e">{SOLUTIONS[solution].ramp[0]}</span> ·
			<span style="color:#eab308">{SOLUTIONS[solution].ramp[1]}</span> ·
			<span style="color:#dc2626">{SOLUTIONS[solution].ramp[2]} km</span>. Full per-point
			deviations: icon-native-test/grid-accuracy/*.csv.gz
		</p>
	</div>
</div>

<style>
	.page {
		position: fixed;
		inset: 0;
	}
	.map {
		width: 100%;
		height: 100%;
	}
	.panel {
		position: absolute;
		top: 10px;
		left: 10px;
		background: rgba(255, 255, 255, 0.94);
		border-radius: 8px;
		padding: 10px 14px;
		font:
			13px/1.5 system-ui,
			sans-serif;
		max-width: 340px;
		box-shadow: 0 1px 6px rgba(0, 0, 0, 0.25);
	}
	.panel h1 {
		font-size: 14px;
		margin: 0 0 6px;
	}
	.panel select {
		width: 100%;
		margin-bottom: 6px;
		font: inherit;
	}
	.panel label {
		display: block;
		cursor: pointer;
	}
	.swatch {
		display: inline-block;
		width: 18px;
		height: 3px;
		vertical-align: middle;
		margin: 0 2px;
	}
	.swatch.blue {
		background: #2563eb;
	}
	.swatch.red {
		background: #dc2626;
	}
	.swatch.gradient {
		background: linear-gradient(90deg, #22c55e, #eab308, #dc2626);
	}
	.panel p {
		margin: 6px 0 0;
	}
	.error {
		color: #b91c1c;
	}
	.hint {
		color: #555;
		font-size: 12px;
	}
</style>
