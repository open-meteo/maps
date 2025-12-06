import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import * as child from 'child_process';
import { mdsvex } from 'mdsvex';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [vitePreprocess(), mdsvex()],
	compilerOptions: {
		modernAst: true
	},
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: null,
			precompress: false,
			strict: true
		}),
		version: {
			name: child.execSync('git rev-parse HEAD').toString().trim()
		}
	},
	extensions: ['.svelte', '.svx']
};

export default config;
