import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'child_process';
import { defineConfig, loadEnv } from 'vite';

import type { IncomingMessage, ServerResponse } from 'http';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';

// The version name MUST be deterministic: it is baked into both the
// prerendered HTML and the client bundle, and Vite evaluates this config more
// than once per build. A `Date.now()` fallback produces two different values,
// the `__sveltekit_*` globals stop matching, and hydration crashes on every
// page (breaking client-side routing in production).
const buildVersion = () => {
	// commit sha provided by Cloudflare CI (Workers Builds / Pages)
	const sha = process.env.WORKERS_CI_COMMIT_SHA ?? process.env.CF_PAGES_COMMIT_SHA;
	if (sha) return sha;
	try {
		return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
	} catch {
		return 'dev';
	}
};

const addHeaders = (res: ServerResponse) => {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET');
	res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
	res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
	res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
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
			sveltekit({
				preprocess: [vitePreprocess()],
				compilerOptions: {
					modernAst: true
				},
				adapter: adapter({
					pages: 'build',
					assets: 'build',
					precompress: false,
					strict: true
				}),
				// Poll _app/version.json so a deploy while the app is open surfaces the
				// update toast (see +layout.svelte). The package version keeps its own
				// job: resetting persisted state, see initStoredState in preferences.ts.
				version: {
					name: buildVersion(),
					pollInterval: 2 * 60 * 1000 // 2 mins
				},
				extensions: ['.svelte', '.svx']
			}),
			viteServerConfig()
		],
		optimizeDeps: {
			exclude: [
				'@openmeteo/file-reader',
				'@openmeteo/file-format-wasm',
				'@openmeteo/weather-map-layer'
			]
		},
		server: {
			fs: {
				// Allow serving files from one level up to the project root
				allow: ['..']
			}
		},
		build: {
			chunkSizeWarningLimit: 1500,
			rollupOptions: {
				output: {
					// Keep all of @openmeteo/weather-map-layer in a single chunk to avoid a
					// rolldown scope-hoisting bug that drops a module-level constant (see the
					// seamless "vr is not defined" crash). Match "weather-map-layer" so it also
					// covers the symlink-resolved real path used during local `npm link` dev,
					// not just the installed "@openmeteo/weather-map-layer" node_modules path.
					manualChunks: (id: string) =>
						id.includes('weather-map-layer') ? 'weather-map-layer' : undefined
				}
			}
		}
	});
};
