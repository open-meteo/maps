import { defineConfig, loadEnv } from 'vite';

import { sveltekit } from '@sveltejs/kit/vite';

import tailwindcss from '@tailwindcss/vite';

import devtoolsJson from 'vite-plugin-devtools-json';

import dts from 'vite-plugin-dts';

/** @type {import('vite').Plugin} */
const viteServerConfig = () => ({
	name: 'add-headers',
	configureServer: (server) => {
		server.middlewares.use((req, res, next) => {
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.setHeader('Access-Control-Allow-Methods', 'GET');
			res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
			res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
			next();
		});
	}
});

export default ({ mode }) => {
	process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };
	const input =
		process.env.GH_PAGES === 'true'
			? {
					index: 'src/main.ts'
				}
			: {
					index: 'src/index.ts'
				};
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
		}
	});
};
