# Open-Meteo Maps

[![codecov](https://codecov.io/gh/open-meteo/maps/graph/badge.svg?token=QRHSC0EGJ8)](https://codecov.io/gh/open-meteo/maps)
[![Tests & Build](https://github.com/open-meteo/maps/actions/workflows/build.yml/badge.svg)](https://github.com/open-meteo/maps/actions/workflows/build.yml)
[![GitHub license](https://img.shields.io/github/license/open-meteo/maps)](https://github.com/open-meteo/maps/blob/main/LICENSE)

A UI demo for the [Open-Meteo Weather Map Layer](https://github.com/open-meteo/weather-map-layer) — a MapLibre/Mapbox GL JS weather layer powered by Open-Meteo OMfiles.

![Open-Meteo Maps UI example](https://static-assets.open-meteo.com/maps/media/example.png)

## About

This is a client-side app that fetches OMfiles from `data-spatial.open-meteo.com` and renders them with MapLibre GL. Weather tiles are fully rendered in the browser at the native model resolution — no server-side tile rendering required.

> Looking for the Open-Meteo API? See [open-meteo/open-meteo](https://github.com/open-meteo/open-meteo).

## Development

Requires Node LTS (see `.nvmrc`).

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

Run checks:

```bash
npm test          # vitest unit tests
npm run check     # svelte-check
npm run lint      # prettier + eslint
```

### Data endpoint

The app fetches OMfiles from `data-spatial.open-meteo.com` by default. Set `VITE_DATA_BASE_URI` (e.g. in `.env.local`) to point a build at a local or staging `data_spatial` endpoint.

The `data_spatial` tree is served from three places:

- `https://openmeteo.s3.amazonaws.com/data_spatial/...` is the AWS S3 origin. Public and uncached, with a browsable index at [openmeteo.s3.amazonaws.com](https://openmeteo.s3.amazonaws.com/index.html#data_spatial/).
- `https://openmeteo-data-spatial.b-cdn.net/...` is the public Bunny CDN cache, used by the [weather-map-layer](https://github.com/open-meteo/weather-map-layer) README and examples. Note that it drops the `data_spatial/` path prefix.
- `https://data-spatial.open-meteo.com/data_spatial/...` is the endpoint this app uses. It only accepts requests with a `localhost` or `*.open-meteo.com` referer.

### Cross-origin isolation

The weather-map-layer renders through `SharedArrayBuffer`, which needs cross-origin isolation. The dev and preview servers send the required `COOP`/`COEP` headers via a plugin in `vite.config.ts`; in production the same headers come from `static/_headers` (Cloudflare Pages). If these headers are ever dropped, the app still works but falls back to a slower path that copies data to every worker.

### Working on the weather-map-layer locally

`package.json` pins `@openmeteo/weather-map-layer` to a git commit. To develop against a local checkout, link it:

```bash
cd ../weather-map-layer && npm link && npm run build
cd ../maps && npm link @openmeteo/weather-map-layer
```

The package resolves through its `dist/` build, so rebuild the weather-map-layer after changes to see them in the app.

## Issues & Contributing

- Open issues and PRs in this repository for UI/demo-related changes.
- For issues with the weather map layer itself, see the [weather-map-layer issues](https://github.com/open-meteo/weather-map-layer/issues).
