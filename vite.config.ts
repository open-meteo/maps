import { defineConfig, loadEnv } from 'vite';

import { sveltekit } from '@sveltejs/kit/vite';

import tailwindcss from '@tailwindcss/vite';

import devtoolsJson from 'vite-plugin-devtools-json';

import dts from 'vite-plugin-dts';

import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';

const viteServerConfig = (): Plugin => ({
	name: 'add-headers',
	configureServer: (server: ViteDevServer) => {
		server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.setHeader('Access-Control-Allow-Methods', 'GET');
			res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
			res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
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
			devtoolsJson(),
			dts({
				insertTypesEntry: true
			}),
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
