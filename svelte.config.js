import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { execSync } from 'child_process';

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

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [vitePreprocess()],
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
		// Poll _app/version.json so a deploy while the app is open surfaces the
		// update toast (see +layout.svelte). The package version keeps its own
		// job: resetting persisted state, see initStoredState in preferences.ts.
		version: {
			name: buildVersion(),
			pollInterval: 2 * 60 * 1000 // 2 mins
		}
	},
	extensions: ['.svelte', '.svx']
};

export default config;
