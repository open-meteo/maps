/**
 * Compare mode: a second map, clipped to the right of a draggable divider,
 * shows the active chart for another domain. The two cameras follow each
 * other, the basemap extras (hillshade, terrain) follow the preferences, and
 * the compare frame is rebuilt from the same chart whenever the main one is
 * (see changeOMfileURL), so every setting applies to both halves. The
 * compared domain is read from its own latest run at the valid time nearest
 * to the selected one: runs and time steps differ per model.
 */
import { get } from 'svelte/store';

import {
	type DomainMetaDataJson,
	domainOptions,
	getConcreteDomainValue
} from '@openmeteo/weather-map-layer';
import * as maplibregl from 'maplibre-gl';
import { toast } from 'svelte-sonner';

import { chartSources } from '#lib/stores/chart.js';
import { compareDomain, compareLoading, compareMeta, compareTime } from '#lib/stores/compare.js';
import { map as m } from '#lib/stores/map.js';
import { preferences } from '#lib/stores/preferences.js';
import { time } from '#lib/stores/time.js';
import { availableVariablesFor } from '#lib/stores/variables.js';

import { variableLabel } from '#lib/components/selection/selection-utils.js';

import { BEFORE_LAYER_RASTER, HILLSHADE_LAYER } from '#lib/constants.js';
import { FrameManager } from '#lib/frame-manager.js';
import { BASE_URI } from '#lib/helpers.js';
import { activeOmUrlsOf, buildChannels } from '#lib/layers.js';
import { addHillshadeLayer, addTerrainSource, getStyle } from '#lib/map-controls.js';
import { addPopup, refreshPopup, removePopupHost } from '#lib/popup.js';
import { findTimeStep } from '#lib/time-utils.js';
import { getOmUrlForSource } from '#lib/url.js';

let compareMap: maplibregl.Map | undefined;
let frameManager: FrameManager | undefined;
let unsyncCameras: (() => void) | undefined;
let unfollowPreferences: (() => void) | undefined;
// Domain and variables of the last "does not provide" warning, so it shows
// once per combination rather than on every time step
let warnedMissing = '';

const cameraOf = (map: maplibregl.Map): maplibregl.CameraOptions => ({
	center: map.getCenter(),
	zoom: map.getZoom(),
	bearing: map.getBearing(),
	pitch: map.getPitch()
});

/**
 * Each map follows the other's camera: gestures, their inertia and flights
 * (location search) alike. The jump fires move events on the followed map
 * synchronously; the guard keeps those from echoing back. A jump also stops
 * the target map's gestures, so one that still glides (drag inertia, scroll
 * zoom) would cut a gesture begun on the other map on every frame; its
 * animation is stopped as soon as the visitor takes the other map.
 */
const syncCameras = (main: maplibregl.Map, compare: maplibregl.Map): (() => void) => {
	let syncing = false;
	const follow = (from: maplibregl.Map, to: maplibregl.Map) => () => {
		if (syncing) return;
		syncing = true;
		to.jumpTo(cameraOf(from));
		syncing = false;
	};
	const takeOver = (other: maplibregl.Map) => () => other.stop();
	const onMainMove = follow(main, compare);
	const onCompareMove = follow(compare, main);
	const onMainGesture = takeOver(compare);
	const onCompareGesture = takeOver(main);
	const onProjectionChange = () => compare.setProjection(main.getProjection());
	const gestures = ['mousedown', 'touchstart', 'wheel'] as const;

	main.on('move', onMainMove);
	compare.on('move', onCompareMove);
	for (const gesture of gestures) {
		main.on(gesture, onMainGesture);
		compare.on(gesture, onCompareGesture);
	}
	main.on('projectiontransition', onProjectionChange);
	return () => {
		main.off('move', onMainMove);
		compare.off('move', onCompareMove);
		for (const gesture of gestures) {
			main.off(gesture, onMainGesture);
			compare.off(gesture, onCompareGesture);
		}
		main.off('projectiontransition', onProjectionChange);
	};
};

/**
 * Hillshade and 3D terrain as the main map has them. Their buttons only
 * touch the main map, and the hillshade layer matters beyond looks: with it
 * on, the raster frames are inserted before it, so it has to exist here too
 * or their layers never make it onto the map. Terrain only exists together
 * with hillshade: its control goes away with the hillshade (see
 * HillshadeButton), which leaves the preference behind.
 */
const applyBasemapPreferences = (map: maplibregl.Map): void => {
	const { hillshade, terrain } = get(preferences);
	const hasHillshade = !!map.getLayer(HILLSHADE_LAYER);
	if (hillshade && !hasHillshade) {
		addHillshadeLayer(map);
		frameManager?.reanchor(BEFORE_LAYER_RASTER, HILLSHADE_LAYER);
	} else if (!hillshade && hasHillshade) {
		frameManager?.reanchor(HILLSHADE_LAYER, BEFORE_LAYER_RASTER);
		map.removeLayer(HILLSHADE_LAYER);
	}
	const wantTerrain = hillshade && terrain;
	if (wantTerrain !== !!map.getTerrain()) {
		map.setTerrain(wantTerrain ? { source: 'terrainSource2' } : null);
	}
};

/**
 * Once a style is in (load, style reload): the terrain sources and the frame
 * manager, since the previous style's sources and layers are gone.
 */
const setUpStyle = (): void => {
	const map = compareMap;
	if (!map) return;
	addTerrainSource(map);
	addTerrainSource(map, 'terrainSource2');
	frameManager?.destroy();
	frameManager = new FrameManager(map, {
		crossFadeMs: 250,
		retainMax: 3,
		onLoadingChange: (isLoading) => compareLoading.set(isLoading),
		onCommit: () => refreshPopup(),
		onError: () =>
			toast.error('Could not load the compared weather data for this view.', {
				id: 'compare-data-error'
			})
	});
	applyBasemapPreferences(map);
	showCompareFrame();
};

/** Create the compare map in `container`, on the main map's camera. */
export const createCompareMap = async (container: HTMLElement): Promise<void> => {
	const main = get(m);
	if (!main || compareMap) return;
	const style = await getStyle();
	// Compare mode was left while the style loaded
	if (!container.isConnected) return;

	const map = new maplibregl.Map({
		container,
		style,
		...cameraOf(main),
		keyboard: false,
		attributionControl: false,
		maxPitch: 85
	});
	// The main map's gestures (see setMapControlSettings)
	map.touchZoomRotate.disableRotation();
	map.scrollZoom.setZoomRate(1 / 85);
	map.scrollZoom.setWheelZoomRate(1 / 85);

	compareMap = map;
	unsyncCameras = syncCameras(main, map);
	// Toggles after the load; the load itself applies the current preferences
	unfollowPreferences = preferences.subscribe(() => {
		if (frameManager && compareMap) applyBasemapPreferences(compareMap);
	});
	map.on('load', () => {
		setUpStyle();
		// The popup follows the pointer onto this half, reading this map's frame
		addPopup(map, () => activeOmUrlsOf(frameManager));
	});
};

/**
 * Counterpart of reloadStyles: the new basemap style wipes the compare
 * map's sources and layers, so the frame manager is rebuilt once it is in.
 */
export const reloadCompareStyle = (): void => {
	const map = compareMap;
	if (!map) return;
	getStyle().then((style) => {
		if (map !== compareMap) return;
		map.setStyle(style);
		map.once('styledata', () => setTimeout(setUpStyle, 50));
	});
};

export const destroyCompareMap = (): void => {
	unsyncCameras?.();
	unsyncCameras = undefined;
	unfollowPreferences?.();
	unfollowPreferences = undefined;
	frameManager?.destroy();
	frameManager = undefined;
	if (compareMap) removePopupHost(compareMap);
	compareMap?.remove();
	compareMap = undefined;
	compareMeta.set(undefined);
	compareTime.set(undefined);
	compareLoading.set(false);
	warnedMissing = '';
};

const fetchMeta = async (url: string): Promise<DomainMetaDataJson | undefined> => {
	const res = await fetch(url);
	return res.ok ? res.json() : undefined;
};

/**
 * Load the compared domain's run info: its latest run, or the in-progress
 * one for a model still writing its first. `latest.json` is that run's full
 * metadata, so no `meta.json` round trip is needed. A seamless composite is
 * described by its base domain's.
 */
export const loadCompareMetaData = async (domainValue: string): Promise<void> => {
	compareMeta.set(undefined);
	compareTime.set(undefined);
	const domain = domainOptions.find(({ value }) => value === domainValue);
	if (!domain) return;

	const base = `${BASE_URI}/${getConcreteDomainValue(domain)}`;
	let meta: DomainMetaDataJson | undefined;
	let error = '';
	try {
		meta =
			(await fetchMeta(`${base}/latest.json`)) ?? (await fetchMeta(`${base}/in-progress.json`));
	} catch (e) {
		error = `: ${(e as Error).message}`;
	}
	// Another domain was picked while the requests were in flight
	if (get(compareDomain) !== domainValue) return;
	if (!meta) {
		toast.error(`Could not load run info for ${domain.label ?? domainValue}${error}`, {
			id: 'compare-run-info-error'
		});
		return;
	}
	meta.valid_times.sort();
	compareMeta.set(meta);
	showCompareFrame();
};

const warnMissingVariables = (domainValue: string, missing: string[]): void => {
	const signature = `${domainValue}:${missing.join(',')}`;
	if (signature === warnedMissing) return;
	warnedMissing = signature;
	if (missing.length === 0) return;
	const label = domainOptions.find(({ value }) => value === domainValue)?.label ?? domainValue;
	toast.warning(`${label} does not provide ${missing.map(variableLabel).join(', ')}`, {
		id: 'compare-missing-variables'
	});
};

/**
 * Show the active chart on the compare map at the compared run's valid time
 * nearest to the selected one. Sources the domain does not serve are left
 * out (the main map keeps showing them); with none left the frame is empty.
 */
export const showCompareFrame = (): void => {
	const domainValue = get(compareDomain);
	const meta = get(compareMeta);
	if (!frameManager || !domainValue || !meta) return;

	const validTimes = meta.valid_times.map((validTime) => new Date(validTime));
	const nearest = findTimeStep(get(time), validTimes) ?? validTimes[0];
	if (!nearest) return;
	compareTime.set(new Date(nearest));

	const available = availableVariablesFor(meta);
	const all = get(chartSources);
	const sources = all.filter(({ variable }) => available.includes(variable));
	warnMissingVariables(
		domainValue,
		all.filter((source) => !sources.includes(source)).map(({ variable }) => variable)
	);

	const path = {
		domain: domainValue,
		modelRun: new Date(meta.reference_time),
		time: nearest,
		validTimes: meta.valid_times
	};
	const channels = buildChannels(sources, (source) => getOmUrlForSource(source, path));
	if (channels) frameManager.show(channels);
};
