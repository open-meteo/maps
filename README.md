# Open-Meteo Maps

[![codecov](https://codecov.io/gh/open-meteo/maps/graph/badge.svg?token=QRHSC0EGJ8)](https://codecov.io/gh/open-meteo/maps)
[![Build](https://github.com/open-meteo/maps/actions/workflows/build.yml/badge.svg)](https://github.com/open-meteo/maps/actions/workflows/build.yml)
[![GitHub license](https://img.shields.io/github/license/open-meteo/maps)](https://github.com/open-meteo/maps/blob/main/LICENSE)

A UI demo for the [Open-Meteo Weather Map Layer](https://github.com/open-meteo/weather-map-layer) — a MapLibre/Mapbox GL JS weather layer powered by Open-Meteo OMfiles.

![Open-Meteo Maps UI example](./static/example.png)

## About

This is a client-side app that fetches OMfiles from [openmeteo.s3.amazonaws.com](https://openmeteo.s3.amazonaws.com/index.html#data_spatial/) and renders them with MapLibre GL. Weather tiles are fully rendered in the browser at the native model resolution — no server-side tile rendering required.

> Looking for the Open-Meteo API? See [open-meteo/open-meteo](https://github.com/open-meteo/open-meteo).

## Development

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

- Open issues and PRs in this repository for UI/demo-related changes.
- For issues with the weather map layer itself, see the [weather-map-layer issues](https://github.com/open-meteo/weather-map-layer/issues).
