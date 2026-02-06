<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { get } from 'svelte/store';

	import {
		GridFactory,
		type RenderableColorScale,
		domainOptions,
		omProtocol,
		updateCurrentBounds
	} from '@openmeteo/mapbox-layer';
	import * as turf from '@turf/turf';
	import { type RequestParameters } from 'maplibre-gl';
	import * as maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { Protocol } from 'pmtiles';
	import { toast } from 'svelte-sonner';

	import { version } from '$app/environment';

	import { map } from '$lib/stores/map';
	import { defaultColorHash, omProtocolSettings } from '$lib/stores/om-protocol-settings';
	import {
		loading,
		localStorageVersion,
		preferences,
		resetStates,
		resolution,
		resolutionSet,
		url
	} from '$lib/stores/preferences';
	import { metaJson, modelRun, time } from '$lib/stores/time';
	import { domain, selectedDomain, selectedVariable, variable } from '$lib/stores/variables';

	import {
		DarkModeButton,
		HelpButton,
		HillshadeButton,
		SettingsButton,
		TimeButton
	} from '$lib/components/buttons';
	import HelpDialog from '$lib/components/help/help-dialog.svelte';
	import Spinner from '$lib/components/loading/spinner.svelte';
	import Scale from '$lib/components/scale/scale.svelte';
	import CountrySelector, { type Country } from '$lib/components/selection/country-selector.svelte';
	import VariableSelection from '$lib/components/selection/variable-selection.svelte';
	import Settings from '$lib/components/settings/settings.svelte';
	import TimeSelector from '$lib/components/time/time-selector.svelte';

	import {
		addHillshadeSources,
		addOmFileLayers,
		addPopup,
		changeOMfileURL,
		checkHighDefinition,
		findTimeStep,
		getInitialMetaData,
		getMetaData,
		getStyle,
		hashValue,
		matchVariableOrFirst,
		setMapControlSettings,
		updateUrl,
		urlParamsToPreferences
	} from '$lib';
	import { formatISOWithoutTimezone } from '$lib/time-format';

	import '../styles.css';

	import type {
		Feature,
		FeatureCollection,
		Geometry,
		GeometryCollection,
		MultiPolygon,
		Polygon
	} from 'geojson';

	let mapContainer: HTMLElement | null;

	onMount(() => {
		$url = new URL(document.location.href);
		urlParamsToPreferences();

		// first time on load, check if monitor supports high definition, for increased tile resolution factor
		if (!get(resolutionSet)) {
			if (checkHighDefinition()) {
				resolution.set(2);
			}
			resolutionSet.set(true);
		}
	});

	onMount(async () => {
		// resets all the states when a new version is set in 'package.json' and version already set before
		if (version !== $localStorageVersion) {
			if ($localStorageVersion) {
				await resetStates();
			}
			$localStorageVersion = version;
		}
	});

	onMount(async () => {
		maplibregl.addProtocol('om', (params: RequestParameters) =>
			omProtocol(params, undefined, $omProtocolSettings)
		);

		const style = await getStyle();

		const domainObject = domainOptions.find(({ value }) => value === $domain);
		if (!domainObject) {
			throw new Error('Domain not found');
		}
		const grid = GridFactory.create(domainObject.grid);

		$map = new maplibregl.Map({
			container: mapContainer as HTMLElement,
			style: style,
			center: grid.getCenter(),
			zoom: domainObject.grid.zoom,
			keyboard: false,
			hash: true,
			maxPitch: 85
		});

		setMapControlSettings();

		$map.on('dataloading', () => {
			updateCurrentBounds($map.getBounds());
		});

		$map.on('load', async () => {
			$map.addControl(new DarkModeButton());
			$map.addControl(new SettingsButton());
			$map.addControl(new TimeButton());
			$map.addControl(new HelpButton());

			if (getInitialMetaDataPromise) await getInitialMetaDataPromise;

			addOmFileLayers();
			addHillshadeSources();
			$map.addControl(new HillshadeButton());

			addPopup();
			changeOMfileURL();
		});
	});

	let getInitialMetaDataPromise: Promise<void> | undefined;
	const domainSubscription = domain.subscribe(async (newDomain) => {
		if ($domain !== newDomain) {
			await tick(); // await the selectedDomain to be set
			updateUrl('domain', newDomain);
			$modelRun = undefined;
			toast('Domain set to: ' + $selectedDomain.label);
		}

		getInitialMetaDataPromise = getInitialMetaData();
		await getInitialMetaDataPromise;
		$metaJson = await getMetaData();

		const timeSteps = $metaJson?.valid_times.map((validTime: string) => new Date(validTime));
		const timeStep = findTimeStep($time, timeSteps);
		// clamp time to valid times in meta data
		if (timeStep) {
			$time = timeStep;
			updateUrl('time', formatISOWithoutTimezone($time));
		} else {
			// otherwise use first valid time
			$time = timeSteps[0];
			updateUrl('time', formatISOWithoutTimezone($time));
		}

		matchVariableOrFirst();
		changeOMfileURL();
	});

	const variableSubscription = variable.subscribe(async (newVar) => {
		if ($variable !== newVar) {
			await tick(); // await the selectedVariable to be set
			updateUrl('variable', newVar);
			toast('Variable set to: ' + $selectedVariable.label);
		}

		if (!$loading) {
			changeOMfileURL();
		}
	});

	onDestroy(() => {
		if ($map) {
			$map.remove();
		}
		domainSubscription(); // unsubscribe
		variableSubscription(); // unsubscribe
	});

	let selectedCountries = $state<string[]>([]);

	const handleCountrySelect = (countries: Country[]) => {
		if (countries.length === 0) {
			$omProtocolSettings.clippingOptions = undefined;
			changeOMfileURL();
			return;
		}

		// Merge all country geojson into one
		const allFeatures = countries.flatMap((country) => {
			if (!country.geojson) return [];
			const flatten = turf.flatten(country.geojson) as FeatureCollection<Geometry>;
			return flatten.features;
		});

		const mergedGeojson: FeatureCollection<Geometry> = {
			type: 'FeatureCollection',
			features: allFeatures
		};

		const flatten = mergedGeojson;

		const polygonFeatures = (flatten.features as Feature<Geometry>[])
			.filter(
				(feature) =>
					feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon'
			)
			.map((feature) => feature as Feature<Polygon | MultiPolygon>);

		let polygon: Feature<Polygon | MultiPolygon> | null = null;

		if (polygonFeatures.length === 0) {
			console.error('No polygon features found');
			return;
		}

		if (polygonFeatures.length === 1) {
			polygon = polygonFeatures[0];
		} else {
			polygon = turf.union(turf.featureCollection(polygonFeatures)) as Feature<
				Polygon | MultiPolygon
			> | null;
		}

		if (!polygon || !polygon.geometry) {
			console.error('Failed to process polygon');
			return;
		}

		const bbox = turf.bbox(polygon);
		const simplifiedPolygon = turf.simplify(polygon, {
			tolerance: 0.00025,
			highQuality: true
		}) as Feature<Geometry> | GeometryCollection;

		let polygons: [number, number][][] = [];

		const geom: Geometry | GeometryCollection | null =
			simplifiedPolygon && typeof simplifiedPolygon === 'object' && 'geometry' in simplifiedPolygon
				? simplifiedPolygon.geometry
				: simplifiedPolygon && typeof simplifiedPolygon === 'object' && 'type' in simplifiedPolygon
					? (simplifiedPolygon as GeometryCollection)
					: null;

		if (!geom) {
			console.error('No geometry found after simplify');
			return;
		}

		if (geom.type === 'Polygon') {
			for (let ring of geom.coordinates) {
				polygons.push(ring as [number, number][]);
			}
		} else if (geom.type === 'MultiPolygon') {
			for (let poly of geom.coordinates) {
				for (let ring of poly) {
					polygons.push(ring as [number, number][]);
				}
			}
		} else if (geom.type === 'GeometryCollection') {
			for (let geometry of geom.geometries) {
				if (geometry.type === 'Polygon') {
					for (let ring of geometry.coordinates) {
						polygons.push(ring as [number, number][]);
					}
				} else if (geometry.type === 'MultiPolygon') {
					for (let poly of geometry.coordinates) {
						for (let ring of poly) {
							polygons.push(ring as [number, number][]);
						}
					}
				}
			}
		}

		if (polygons.length === 0) {
			console.error('No valid polygons found in geometry');
			return;
		}

		const bounds: [number, number, number, number] = [bbox[0], bbox[1], bbox[2], bbox[3]];

		$omProtocolSettings.clippingOptions = {
			polygons: [polygons],
			bounds
		};
		changeOMfileURL();
	};
</script>

<svelte:head>
	<title>Open-Meteo Maps</title>
</svelte:head>

{#if $loading}
	<Spinner />
{/if}

<div
	class="map maplibregl-map {$preferences.timeSelector ? 'time-selector-open' : ''}"
	id="#map_container"
	bind:this={mapContainer}
></div>

<Scale
	afterColorScaleChange={async (variable: string, colorScale: RenderableColorScale) => {
		$omProtocolSettings.colorScales[variable] = colorScale;
		const colorHash = await hashValue(JSON.stringify($omProtocolSettings.colorScales));
		updateUrl('color_hash', colorHash, defaultColorHash);
		changeOMfileURL();
		toast('Changed color scale');
	}}
/>
<VariableSelection />
<CountrySelector bind:selectedCountries onselect={handleCountrySelect} />
<TimeSelector />
<Settings />
<HelpDialog />
