# Open-Meteo Maps

[![Build](https://github.com/open-meteo/maps/actions/workflows/build.yml/badge.svg)](https://github.com/open-meteo/maps/actions/workflows/build.yml) [![GitHub license](https://img.shields.io/github/license/open-meteo/maps)](https://github.com/open-meteo/maps/blob/main/LICENSE)

![example](./static/example.png)

This repository showcases the Open-Meteo file protocol for MapLibre GL JS maps. The OM files used are hosted on a S3 storage which can be found [here](https://openmeteo.s3.amazonaws.com/). The weather API code can be found in [this](https://github.com/open-meteo/open-meteo) repository.

For this project a seperate package with wasm code is required

### WIP: Using the protocol

#### Vanilla / HMTL

```html
<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.7.0/dist/maplibre-gl.css" />
		<script src="https://unpkg.com/maplibre-gl@5.7.0/dist/maplibre-gl.js"></script>
		<script src="https://unpkg.com/@open-meteo/om-protocol/dist/index.js"></script>
		<style>
			html,
			body,
			#map {
				height: 100%;
			}
		</style>
	</head>
	<body>
		<div id="map"></div>
		<script>
			maplibregl.addProtocol('om', omProtocol);

			const map = new maplibregl.Map({
				container: 'map',
				style: {
					version: 8,
					sources: {
						osm: {
							type: 'raster',
							tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
							tileSize: 256,
							attribution: '&copy; OpenStreetMap Contributors',
							maxzoom: 19
						}
					},
					layers: [
						{
							id: 'osm',
							type: 'raster',
							source: 'osm'
						}
					]
				}
			});

			const omUrl = `https://openmeteo.s3.amazonaws.com/data_spatial/dwd_icon_d2/2025/08/29/0600Z/2025-08-29T1200.om?variable=temperature_2m`;

			map.on('load', () => {
				map.addSource('omFileSource', {
					url: 'om://' + omUrl,
					type: 'raster',
					tileSize: 256
				});

				map.addLayer({
					id: 'omFileLayer',
					type: 'raster',
					source: 'omFileSource'
				});
			});
		</script>
	</body>
</html>
```

#### Node

```bash
npm install @open-meteo/om-protocol
```

```ts
import maplibregl from 'maplibre-gl';
import { omProtocol } from '@open-meteo/om-protocol';

maplibregl.addProtocol('om', omProtocol);

map = new maplibregl.Map({
	container: mapContainer as HTMLElement,
	style: {
		version: 8,
		sources: {
			osm: {
				type: 'raster',
				tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
				tileSize: 256,
				attribution: '&copy; OpenStreetMap Contributors',
				maxzoom: 19
			}
		},
		layers: [
			{
				id: 'osm',
				type: 'raster',
				source: 'osm'
			}
		]
	}
});

const omUrl = `https://openmeteo.s3.amazonaws.com/data_spatial/dwd_icon_d2/2025/08/29/0600Z/2025-08-29T1200.om?variable=temperature_2m`;

map.on('load', () => {
	map.addSource('omFileSource', {
		url: 'om://' + omUrl,
		type: 'raster',
		tileSize: 256
	});

	map.addLayer({
		id: 'omFileLayer',
		type: 'raster',
		source: 'omFileSource'
	});
});
```

### ToDo

- Custom colour scales
- More elaborate documentation
