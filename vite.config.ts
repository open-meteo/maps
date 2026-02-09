import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig, loadEnv } from 'vite';
import devtoolsJson from 'vite-plugin-devtools-json';

import type { IncomingMessage, ServerResponse } from 'http';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';

const addHeaders = (res: ServerResponse) => {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET');
	res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
	res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
};

const viteServerConfig = (): Plugin => ({
	name: 'add-headers',
	configureServer: (server: ViteDevServer) => {
		server.middlewares.use((_req: IncomingMessage, res: ServerResponse, next: () => void) => {
			addHeaders(res);
			next();
		});
	},
	configurePreviewServer: (server: PreviewServer) => {
		server.middlewares.use((_req: IncomingMessage, res: ServerResponse, next: () => void) => {
			addHeaders(res);
			next();
		});
	}
});

export default ({ mode }: { mode: string }) => {
	process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };

	return defineConfig({
		plugins: [
			tailwindcss(),
			sveltekit(),
			SvelteKitPWA({
				srcDir: './src',
				manifest: {
					name: 'Open-Meteo Maps',
					short_name: 'OM Maps',
					description: 'Weather maps using Open-Meteo protocol and MapLibre GL JS',
					theme_color: '#ff8501',
					background_color: '#ffffff',
					start_url: '/',
					scope: '/',
					display: 'standalone',
					icons: [
						{
							src: 'favicon.ico',
							sizes: '32x32',
							type: 'image/x-icon'
						},
						{
							// TODO: example.png is not the correct icon here...
							src: 'example.png',
							sizes: '1920x1080',
							type: 'image/png'
						}
					]
				},
				injectManifest: {
					globPatterns: ['client/**/*.{js,css,ico,png,svg,webp}']
				},
				workbox: {
					maximumFileSizeToCacheInBytes: 5242880,
					globPatterns: ['client/**/*.{js,css,ico,png,svg,webp}'],
					// Runtime caching for weather data and map tiles
					// TODO: Improve these caching rules!
					runtimeCaching: [
						{
							urlPattern: /^https:\/\/openmeteo\.s3\.amazonaws\.com\/data_spatial\/.*\.json$/,
							handler: 'NetworkFirst',
							options: {
								cacheName: 'weather-metadata',
								expiration: {
									maxEntries: 50,
									maxAgeSeconds: 60 * 60 * 24 // 1 day
								}
							}
						},
						{
							urlPattern: /^https:\/\/maptiler\.servert\.nl\/.*\.webp$/,
							handler: 'CacheFirst',
							options: {
								cacheName: 'map-tiles',
								expiration: {
									maxEntries: 500,
									maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
								},
								cacheableResponse: {
									statuses: [0, 200]
								}
							}
						},
						{
							urlPattern: ({ url }) => url.href.includes('.tiles.mapterhorn.com'),
							handler: 'CacheFirst',
							options: {
								cacheName: 'mapterhorn-cache',
								expiration: {
									maxEntries: 20,
									maxAgeSeconds: 60 * 60 * 24 * 30
								},
								cacheableResponse: {
									statuses: [0, 200, 206]
								},
								rangeRequests: true
							}
						}
					],
					navigateFallback: '/',
					cleanupOutdatedCaches: true
				},
				devOptions: {
					enabled: false,
					suppressWarnings: false,
					type: 'module',
					navigateFallback: '/'
				}
			}),
			devtoolsJson(),
			viteServerConfig()
		],
		optimizeDeps: {
			exclude: ['@openmeteo/file-reader', '@openmeteo/file-format-wasm']
		},
		server: {
			fs: {
				// Allow serving files from one level up to the project root
				allow: ['..']
			}
		},
		build: { chunkSizeWarningLimit: 1500 }
	});
};
