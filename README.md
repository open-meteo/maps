# Open-Meteo Maps

[![Build](https://github.com/open-meteo/maps/actions/workflows/build.yml/badge.svg)](https://github.com/open-meteo/maps/actions/workflows/build.yml) [![GitHub license](https://img.shields.io/github/license/open-meteo/maps)](https://github.com/open-meteo/maps/blob/main/LICENSE)

UI demo for the [Open-Meteo MapLibre/Mapbox protocol](https://github.com/open-meteo/mapbox-layer).

![Open-Meteo Maps UI example](./static/example.png)

## About this Repository

This is a simple client-side UI that loads OM files from [https://openmeteo.s3.amazonaws.com/](https://openmeteo.s3.amazonaws.com/index.html#data_spatial/) and renders them with MapLibre GL using the Open-Meteo MapLibre/Mapbox protocol.
Weather tiles are fully rendered on the client using the data in the native model resolution.

This is not the [Open-Meteo weather API](https://github.com/open-meteo/open-meteo).

## Development

Install and run dev server:

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Issues & Contributing

- Open issues/PRs in this repository for UI/demo changes.
- For protocol-specific issues, see https://github.com/open-meteo/mapbox-layer/issues.
