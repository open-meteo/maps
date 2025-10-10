import { defineConfig, loadEnv } from 'vite';

import { sveltekit } from '@sveltejs/kit/vite';

import tailwindcss from '@tailwindcss/vite';

import devtoolsJson from 'vite-plugin-devtools-json';

import dts from 'vite-plugin-dts';

export default ({ mode }: { mode: string }) => {
	process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };

	return defineConfig({
		plugins: [
			tailwindcss(),
			sveltekit(),
			devtoolsJson(),
			dts({
				insertTypesEntry: true
			})
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
