<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	import {
		IconGrid,
		IconGridAnalytical,
		IconGridGeometric,
		IconMeshGrid,
		parseIconMeshGeometry
	} from '@openmeteo/weather-map-layer';
	import * as maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';

	import { getStyle } from '$lib/map-controls';

	// Debug view for the native ICON grids (issue #278): draws a selectable grid
	// implementation next to the actual DWD grid (vertices + topology extracted
	// from the official grid NetCDF files, served by icon-native-test/serve.mjs)
	// plus the centre displacement.
	//
	// Domains:
	//  - Global R3B07: warp table (~35 m) / polynomial (~0.75 km) / geometric
	//    (~21 km) vs icon_grid_0026.
	//  - EU nest 0037 (13 km, R3B07 N02): the nest cells coincide with global
	//    R3B07 cells (~29 m), so the same three implementations are compared —
	//    paired per cell via findCell on the nest centres.
	//  - D2 0047 (R19B07, 2.2 km): limited-area grid with no analytical
	//    construction — compares the file-based IconMeshGrid (what the map
	//    renders) against an independent extraction of the same grid file, an
	//    end-to-end pipeline check (expect metre-scale f32 rounding only).

	const DATA_BASE = 'http://localhost:8090/grid-viz';
	const MAX_CELLS = 9000; // more gets slow and unreadable
	const R_KM = 6371.229;
	const rad2deg = 180 / Math.PI;
	const deg2rad = Math.PI / 180;

	type AnyGrid = IconGrid | IconGridAnalytical | IconGridGeometric | IconMeshGrid;
	interface Solution {
		label: string;
		ramp: [number, number, number]; // displacement colour stops (km)
		grid: () => Promise<AnyGrid>;
	}

	const globalGridData = {
		type: 'icon',
		nx: 2949120,
		ny: 1,
		iconRoot: 3,
		iconBisections: 7
	} as const;
	// the three global implementations are shared by the global + EU domains
	const globalSolutions: Record<string, Solution> = {
		table: {
			label: 'warp table — IconGrid (~35 m)',
			ramp: [0, 0.25, 0.5],
			grid: async () => tableGrid
		},
		analytical: {
			label: 'polynomial — IconGridAnalytical (~0.75 km)',
			ramp: [0, 1, 2],
			grid: async () => new IconGridAnalytical(globalGridData)
		},
		geometric: {
			label: 'pure geometric — IconGridGeometric (~21 km)',
			ramp: [0, 30, 65],
			grid: async () => new IconGridGeometric(globalGridData)
		}
	};
	const tableGrid = new IconGrid(globalGridData);

	// D2: the file-based mesh the map actually renders with
	const d2MeshSolution: Record<string, Solution> = {
		mesh: {
			label: 'file mesh — IconMeshGrid (pipeline check)',
			ramp: [0, 0.1, 0.25],
			grid: async () => {
				const r = await fetch('/grid-geometry/dwd_icon_d2.bin');
				if (!r.ok) throw new Error(`dwd_icon_d2.bin: HTTP ${r.status}`);
				const geometry = parseIconMeshGeometry(await r.arrayBuffer());
				return new IconMeshGrid(
					{ type: 'icon-mesh', nx: geometry.nCells, ny: 1, geometry: 'inline' },
					geometry
				);
			}
		}
	};

	interface DomainDef {
		label: string;
		tag: string; // grid-viz file suffix of the actual (NetCDF) data
		actualN: number;
		// cells per full sphere at this density, for the zoom gate
		effectiveN: number;
		solutions: Record<string, Solution>;
		// pair a solution/BFS cell index with the actual-array index
		pairing: 'identity' | 'nest-map';
		home: { center: [number, number]; zoom: number };
	}
	const DOMAINS: Record<string, DomainDef> = {
		global: {
			label: 'Global — R3B07 13 km (icon_grid_0026)',
			tag: 'r3b7',
			actualN: 2949120,
			effectiveN: 2949120,
			solutions: globalSolutions,
			pairing: 'identity',
			home: { center: [8.5, 47.3], zoom: 7 }
		},
		eu: {
			label: 'EU nest — R3B07 N02 13 km (icon_grid_0037)',
			tag: 'eu',
			actualN: 164984,
			effectiveN: 2949120,
			solutions: globalSolutions,
			pairing: 'nest-map',
			home: { center: [10, 50], zoom: 7 }
		},
		d2: {
			label: 'D2 — R19B07 2.2 km (icon_grid_0047)',
			tag: 'd2',
			actualN: 542040,
			// 542k cells over the D2 bbox (~0.07 sr) → global-equivalent density
			effectiveN: 97_000_000,
			solutions: d2MeshSolution,
			pairing: 'identity',
			home: { center: [10.5, 50.5], zoom: 9 }
		}
	};
	type DomainKey = keyof typeof DOMAINS;

	let mapContainer: HTMLElement;
	let map: maplibregl.Map | undefined;
	let loadError = $state('');
	let loading = $state(true);
	let tooManyCells = $state(false);
	let outsideDomain = $state(false);
	let stats = $state({ cells: 0, meanKm: 0, maxKm: 0 });
	let domain = $state<DomainKey>('global');
	let solution = $state('table');
	let showSolution = $state(true);
	let showActual = $state(true);
	let showDisplacement = $state(true);

	// actual grid data (from the NetCDF extractions), per domain tag
	interface ActualData {
		clat: Float32Array; // radians
		clon: Float32Array;
		vlat: Float32Array;
		vlon: Float32Array;
		vertexOfCell: Int32Array; // layout [3, N], 1-based
		// global cell index -> actual index (only for 'nest-map' pairing)
		nestMap: Map<number, number> | null;
	}
	// plain module-level caches, never rendered — reactivity unwanted
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const actualCache = new Map<string, ActualData>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const gridCache = new Map<string, AnyGrid>();

	// note: no generic arrow function here — svelte's TS stripping drops the
	// runtime parameters of `async <T extends ...>(...)` along with the types
	const fetchBuffer = async (name: string): Promise<ArrayBuffer> => {
		const r = await fetch(`${DATA_BASE}/${name}`);
		if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
		return r.arrayBuffer();
	};

	const loadActual = async (dom: DomainDef): Promise<ActualData> => {
		const cached = actualCache.get(dom.tag);
		if (cached) return cached;
		const [clatBuf, clonBuf, vlatBuf, vlonBuf, vocBuf] = await Promise.all([
			fetchBuffer(`clat_${dom.tag}.f32`),
			fetchBuffer(`clon_${dom.tag}.f32`),
			fetchBuffer(`vlat_${dom.tag}.f32`),
			fetchBuffer(`vlon_${dom.tag}.f32`),
			fetchBuffer(`vertex_of_cell_${dom.tag}.i32`)
		]);
		const data: ActualData = {
			clat: new Float32Array(clatBuf),
			clon: new Float32Array(clonBuf),
			vlat: new Float32Array(vlatBuf),
			vlon: new Float32Array(vlonBuf),
			vertexOfCell: new Int32Array(vocBuf),
			nestMap: null
		};
		if (dom.pairing === 'nest-map') {
			// nest cells coincide with global R3B07 cells: pair via point lookup
			// (plain lookup table, never rendered)
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const m = new Map<number, number>();
			for (let i = 0; i < data.clat.length; i++) {
				m.set(tableGrid.findCell(data.clat[i] * rad2deg, data.clon[i] * rad2deg), i);
			}
			data.nestMap = m;
		}
		actualCache.set(dom.tag, data);
		return data;
	};

	const loadSolutionGrid = async (domKey: DomainKey, solKey: string): Promise<AnyGrid> => {
		const key = `${domKey === 'd2' ? 'd2' : 'global'}:${solKey}`;
		const cached = gridCache.get(key);
		if (cached) return cached;
		const grid = await DOMAINS[domKey].solutions[solKey].grid();
		gridCache.set(key, grid);
		return grid;
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
	// centre across the edge plane and locate the resulting point (-1 outside a
	// limited-area domain)
	const neighborAcross = (
		grid: AnyGrid,
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
	// edge-neighbours starting from the view centre
	const visibleCells = (
		grid: AnyGrid,
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
				if (nb >= 0 && !visited.has(nb)) {
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

	let updateToken = 0;
	const update = async () => {
		if (!map || loading) return;
		const token = ++updateToken;
		const dom = DOMAINS[domain];
		const bounds = map.getBounds();
		// expected cell count from the view's solid angle at the domain's density
		const area =
			(bounds.getEast() - bounds.getWest()) *
			deg2rad *
			(Math.sin(bounds.getNorth() * deg2rad) - Math.sin(bounds.getSouth() * deg2rad));
		const clear = () => {
			for (const s of ['solution-mesh', 'actual-mesh', 'displacement', 'true-centers']) {
				(map!.getSource(s) as maplibregl.GeoJSONSource)?.setData({
					type: 'FeatureCollection',
					features: []
				});
			}
			stats = { cells: 0, meanKm: 0, maxKm: 0 };
		};
		if ((area / ((4 * Math.PI) / dom.effectiveN)) * 1.2 > MAX_CELLS) {
			tooManyCells = true;
			outsideDomain = false;
			clear();
			return;
		}
		tooManyCells = false;

		const [grid, actual] = await Promise.all([loadSolutionGrid(domain, solution), loadActual(dom)]);
		if (token !== updateToken || !map) return; // superseded while loading

		const c = map.getCenter();
		const startCell = grid.findCell(c.lat, c.lng);
		if (startCell < 0) {
			outsideDomain = true;
			clear();
			return;
		}
		outsideDomain = false;
		const cells = visibleCells(grid, bounds, startCell);
		const lonRef = c.lng;
		const N = actual.clat.length;

		const solutionMesh: GeoJSON.Feature[] = [];
		const actualMesh: GeoJSON.Feature[] = [];
		const displacement: GeoJSON.Feature[] = [];
		const centers: GeoJSON.Feature[] = [];
		let sum = 0;
		let max = 0;
		let paired = 0;
		for (const cell of cells) {
			const actualIdx = actual.nestMap ? (actual.nestMap.get(cell) ?? -1) : cell;
			if (actualIdx < 0 || actualIdx >= N) continue; // outside the nest / domain
			paired++;
			solutionMesh.push({
				type: 'Feature',
				properties: {},
				geometry: { type: 'LineString', coordinates: triangleRing(grid.cellVertices(cell), lonRef) }
			});
			const trueTri = [0, 1, 2].map((v) => {
				const vi = actual.vertexOfCell[v * N + actualIdx] - 1;
				return { lat: actual.vlat[vi] * rad2deg, lon: actual.vlon[vi] * rad2deg };
			});
			actualMesh.push({
				type: 'Feature',
				properties: {},
				geometry: { type: 'LineString', coordinates: triangleRing(trueTri, lonRef) }
			});
			const ana = grid.cellCoordinates(cell);
			const tLat = actual.clat[actualIdx] * rad2deg;
			const tLon = actual.clon[actualIdx] * rad2deg;
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
		stats = { cells: paired, meanKm: sum / (paired || 1), maxKm: max };

		const set = (id: string, features: GeoJSON.Feature[]) =>
			(map!.getSource(id) as maplibregl.GeoJSONSource)?.setData({
				type: 'FeatureCollection',
				features
			});
		set('solution-mesh', solutionMesh);
		set('actual-mesh', actualMesh);
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
		const ramp = DOMAINS[domain].solutions[solution].ramp;
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

	const onDomainChange = () => {
		const dom = DOMAINS[domain];
		if (!dom.solutions[solution]) solution = Object.keys(dom.solutions)[0];
		// jump to the domain if the current view can't show it
		if (map) {
			const c = map.getCenter();
			const inView =
				domain === 'global' ||
				(DOMAINS[domain].pairing === 'nest-map'
					? c.lat > 28 && c.lat < 71 && c.lng > -25 && c.lng < 63
					: c.lat > 43.2 && c.lat < 58 && c.lng > -3.9 && c.lng < 20.3);
			if (!inView || map.getZoom() < 5) {
				map.jumpTo({ center: dom.home.center, zoom: dom.home.zoom });
				return; // moveend fires update
			}
		}
	};

	$effect(() => {
		void showSolution;
		void showActual;
		void showDisplacement;
		setVisibility();
	});

	$effect(() => {
		void domain;
		onDomainChange();
		setDisplacementRamp();
		update();
	});

	$effect(() => {
		void solution;
		setDisplacementRamp();
		update();
	});

	onMount(async () => {
		try {
			// verify the data server before building the map (clear error otherwise)
			await loadActual(DOMAINS.global);
		} catch (e) {
			loadError = `Failed to load grid data from ${DATA_BASE} — is icon-native-test/serve.mjs running? (${e})`;
			loading = false;
			return;
		}

		map = new maplibregl.Map({
			container: mapContainer,
			style: await getStyle(),
			center: DOMAINS.global.home.center,
			zoom: DOMAINS.global.home.zoom,
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
		<h1>ICON: implementations vs actual grid</h1>
		<select bind:value={domain}>
			{#each Object.entries(DOMAINS) as [key, d] (key)}
				<option value={key}>{d.label}</option>
			{/each}
		</select>
		<select bind:value={solution}>
			{#each Object.entries(DOMAINS[domain].solutions) as [key, s] (key)}
				<option value={key}>{s.label}</option>
			{/each}
		</select>
		<label
			><input type="checkbox" bind:checked={showSolution} /> <span class="swatch blue"></span> selected
			implementation</label
		>
		<label
			><input type="checkbox" bind:checked={showActual} /> <span class="swatch red"></span> actual grid
			(NetCDF)</label
		>
		<label
			><input type="checkbox" bind:checked={showDisplacement} />
			<span class="swatch gradient"></span> centre displacement</label
		>
		{#if loading}
			<p>loading grid data (one-off per domain)…</p>
		{:else if loadError}
			<p class="error">{loadError}</p>
		{:else if tooManyCells}
			<p>zoom in to draw the grids</p>
		{:else if outsideDomain}
			<p>view centre is outside this domain — pick the domain again to jump there</p>
		{:else}
			<p>
				{stats.cells} cells — deviation mean {stats.meanKm < 1
					? `${(stats.meanKm * 1000).toFixed(0)} m`
					: `${stats.meanKm.toFixed(1)} km`}, max
				{stats.maxKm < 1 ? `${(stats.maxKm * 1000).toFixed(0)} m` : `${stats.maxKm.toFixed(1)} km`}
			</p>
		{/if}
		<p class="hint">
			displacement colour: <span style="color:#22c55e"
				>{DOMAINS[domain].solutions[solution]?.ramp[0]}</span
			>
			·
			<span style="color:#eab308">{DOMAINS[domain].solutions[solution]?.ramp[1]}</span> ·
			<span style="color:#dc2626">{DOMAINS[domain].solutions[solution]?.ramp[2]} km</span>. Full
			per-point deviations: icon-native-test/grid-accuracy/*.csv.gz
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
		max-width: 360px;
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
