#!/usr/bin/env node
/**
 * Reproducible domain screenshots for the Open-Meteo website.
 *
 * Drives the maps app in screenshot mode (`?screenshot=1`) with Playwright, framing
 * each domain, drawing a clean outline around its footprint (via the seamless-domain
 * boundary primitives in weather-map-layer) and exporting the map canvas to a `.webp`
 * that lands in the website's `static/images/models/` folder, named by domain value.
 *
 * Usage:
 *   node scripts/domain-screenshots.mjs                 # all domains
 *   node scripts/domain-screenshots.mjs --only=dwd_icon,ncep_hrrr_conus
 *   node scripts/domain-screenshots.mjs --list          # just print the domain list
 *   BASE_URL=http://localhost:5173 node scripts/domain-screenshots.mjs   # reuse a running dev server
 *
 * Options (env or flags):
 *   --out=<dir>        output directory (default: ../open-meteo-website/static/images/models)
 *   --only=a,b,c       only capture these domains
 *   --skip-existing    don't overwrite files that already exist
 *   --dark             capture the dark theme, writing <domain>_dark.webp
 *   --include-global   also capture global models (skipped by default)
 *   --include-seamless also capture the *_seamless composites (skipped by default)
 *   --include-eps      also capture ensemble (*_eps) variants (skipped by default)
 *   --include-upper-level also capture *_upper_level variants (skipped by default)
 *   --width / --height viewport size in CSS px (default 820x720)
 *   --scale            device pixel ratio (default 1)
 *   --quality          webp quality 0..1 (default 0.8)
 *   --padding          margin in CSS px around the domain footprint (default 90)
 *   --port             dev server port (default 5173; must be a CORS-allowed origin)
 *   --timeout          per-domain readiness timeout in ms (default 90000)
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mapsRoot = resolve(__dirname, '..');

// sharp is used to encode the captured PNG frames to .webp. It ships with the
// website project; resolve it from there (or wherever a copy is available).
const loadSharp = () => {
	const bases = [resolve(mapsRoot, '../open-meteo-website'), mapsRoot, process.cwd()];
	for (const base of bases) {
		try {
			return createRequire(resolve(base, 'package.json'))('sharp');
		} catch {
			/* try next */
		}
	}
	throw new Error(
		'Could not resolve "sharp" (needed to write .webp). Install it in the website project: npm i sharp'
	);
};

// --- argument parsing --------------------------------------------------------
// Supports both `--key=value` and `--key value`. Flags with no value (or followed
// by another `--flag`) become booleans; the ones below never consume a value.
const BOOLEAN_FLAGS = new Set([
	'list',
	'skip-existing',
	'include-global',
	'include-seamless',
	'include-eps',
	'include-upper-level'
]);
const args = new Map();
{
	const argv = process.argv.slice(2);
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i];
		if (!token.startsWith('--')) continue;
		const body = token.slice(2);
		const eq = body.indexOf('=');
		if (eq !== -1) {
			args.set(body.slice(0, eq), body.slice(eq + 1));
		} else if (BOOLEAN_FLAGS.has(body)) {
			args.set(body, true);
		} else {
			const next = argv[i + 1];
			if (next !== undefined && !next.startsWith('--')) {
				args.set(body, next);
				i++;
			} else {
				args.set(body, true);
			}
		}
	}
}
const opt = (name, fallback) => (args.has(name) ? args.get(name) : fallback);

const OUT_DIR = resolve(
	mapsRoot,
	String(opt('out', process.env.OUT_DIR ?? '../open-meteo-website/static/images/models'))
);
const ONLY = opt('only', null)
	? String(opt('only', ''))
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
	: null;
const SKIP_EXISTING = args.has('skip-existing');
// Capture the dark-themed map and write `<domain>_dark.webp` instead of `<domain>.webp`.
const DARK = args.has('dark');
// Defaults chosen to roughly match the size of the previous model-area images
// (~50–100 KB). Bump --scale / --quality / --width for higher-resolution captures.
const WIDTH = Number(opt('width', 1025));
const HEIGHT = Number(opt('height', 900));
const SCALE = Number(opt('scale', 1));
const QUALITY = Number(opt('quality', 0.85));
// Margin (CSS px) kept around the domain footprint when framing it.
const PADDING = Number(opt('padding', 90));
// Default to 5173: the maps tile/style hosts allow-list localhost:5173 for CORS,
// so the base map only loads on that origin. Override with --port if it's taken.
const PORT = Number(opt('port', 5173));
const READY_TIMEOUT_MS = Number(opt('timeout', 90_000));

// A representative default variable for each kind of domain. The app falls back to
// the domain's first available variable if the chosen one isn't offered, so this
// only needs to be a sensible hint.
const defaultVariable = (domain) => {
	if (/greenhouse/.test(domain)) return 'carbon_dioxide';
	if (/^cams/.test(domain)) return 'pm2_5';
	if (/current/.test(domain)) return 'ocean_u_current';
	if (/sea_surface_temperature/.test(domain)) return 'sea_surface_temperature';
	if (/wave|wam|gfswave/.test(domain)) return 'wave_height';
	return 'temperature_2m';
};

// --- dev server --------------------------------------------------------------
const waitForServer = async (url, timeoutMs = 120_000) => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(url);
			if (res.ok) return;
		} catch {
			/* not up yet */
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(`Dev server at ${url} did not become ready in time`);
};

const startServer = async () => {
	if (process.env.BASE_URL) {
		console.log(`Using existing server at ${process.env.BASE_URL}`);
		return { base: process.env.BASE_URL, stop: async () => {} };
	}
	const base = `http://localhost:${PORT}`;
	console.log(`Starting maps dev server on ${base} ...`);
	// --force re-optimizes deps so the locally-built weather-map-layer is picked up.
	const child = spawn(
		'npm',
		['run', 'dev', '--', '--port', String(PORT), '--strictPort', '--force'],
		{ cwd: mapsRoot, stdio: ['ignore', 'pipe', 'pipe'], env: process.env }
	);
	child.stdout.on('data', (d) => process.env.DEBUG && process.stdout.write(`[vite] ${d}`));
	child.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
	await waitForServer(base);
	return {
		base,
		stop: async () =>
			new Promise((r) => {
				child.once('exit', r);
				child.kill('SIGTERM');
			})
	};
};

// --- main --------------------------------------------------------------------
const run = async () => {
	mkdirSync(OUT_DIR, { recursive: true });
	const sharp = args.has('list') ? null : loadSharp();

	const { base, stop } = await startServer();
	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: WIDTH, height: HEIGHT },
		deviceScaleFactor: SCALE,
		// mode-watcher follows the OS preference, so this selects the map's light/dark theme.
		colorScheme: DARK ? 'dark' : 'light'
	});
	const page = await context.newPage();
	page.setDefaultTimeout(READY_TIMEOUT_MS);
	page.setDefaultNavigationTimeout(READY_TIMEOUT_MS);
	page.on('console', (msg) => process.env.DEBUG && console.log(`[page] ${msg.text()}`));

	// Navigate to a domain and wait until its frame is fully rendered. Returns true if
	// the app signalled readiness, false if we timed out (caller captures anyway).
	const loadDomain = async (url) => {
		await page.goto(url, { waitUntil: 'domcontentloaded' });
		try {
			await page.waitForFunction('window.__omScreenshotReady === true', {
				timeout: READY_TIMEOUT_MS
			});
			return true;
		} catch {
			return false;
		}
	};

	try {
		// Bootstrap once to read the full domain list from the app.
		await page.goto(`${base}/?screenshot=1`, { waitUntil: 'domcontentloaded' });
		await page.waitForFunction('Array.isArray(window.__omDomains) && window.__omDomains.length', {
			timeout: 60_000
		});
		let domains = await page.evaluate(() => window.__omDomains);

		// The `*_seamless` composites are blended multi-domain views rather than a
		// single domain footprint; skip them unless explicitly requested.
		if (!args.has('include-seamless')) domains = domains.filter((d) => !/_seamless$/.test(d.value));

		// Global models don't have a meaningful regional footprint to frame; skip them
		// unless explicitly requested with --include-global.
		if (!args.has('include-global')) domains = domains.filter((d) => !d.global);

		// Ensemble (*_eps) and *_upper_level variants share the footprint of their base
		// domain, so they'd be duplicate images; skip them unless explicitly requested.
		if (!args.has('include-eps')) domains = domains.filter((d) => !/_eps$/.test(d.value));
		if (!args.has('include-upper-level'))
			domains = domains.filter((d) => !/_upper_level$/.test(d.value));

		if (args.has('list')) {
			for (const d of domains) console.log(`${d.value}\t${d.label}`);
			return;
		}
		if (ONLY) domains = domains.filter((d) => ONLY.includes(d.value));

		console.log(`Capturing ${domains.length} domain(s) into ${OUT_DIR}`);
		const failed = [];
		for (const [i, d] of domains.entries()) {
			const file = resolve(OUT_DIR, `${d.value}${DARK ? '_dark' : ''}.webp`);
			if (SKIP_EXISTING && existsSync(file)) {
				console.log(`  [${i + 1}/${domains.length}] ${d.value} — skipped (exists)`);
				continue;
			}
			const variable = defaultVariable(d.value);
			const url = `${base}/?screenshot=1&domain=${encodeURIComponent(d.value)}&variable=${encodeURIComponent(variable)}&padding=${PADDING}`;
			try {
				// One retry: slow/cold data occasionally misses the readiness window.
				let ready = await loadDomain(url);
				if (!ready) ready = await loadDomain(url);
				// A short extra settle so the final frame is fully painted before capture.
				await page.waitForTimeout(ready ? 600 : 1500);
				// Capture via the compositor (reliable in headless, unlike WebGL canvas
				// read-back) and encode to webp.
				const png = await page.screenshot({ type: 'png' });
				await sharp(png)
					.webp({ quality: Math.round(QUALITY * 100) })
					.toFile(file);
				const note = ready ? '' : ' (captured without ready signal)';
				if (!ready) failed.push(d.value);
				console.log(
					`  [${i + 1}/${domains.length}] ${d.value} (${variable}) → ${d.value}${DARK ? '_dark' : ''}.webp${note}`
				);
			} catch (err) {
				failed.push(d.value);
				console.warn(`  [${i + 1}/${domains.length}] ${d.value} — FAILED: ${err.message}`);
			}
		}

		if (failed.length)
			console.warn(
				`\nDomains to review (${failed.length}) — captured without a ready signal or failed: ${failed.join(', ')}`
			);
		else console.log('\nAll domains captured cleanly.');
	} finally {
		await browser.close();
		await stop();
	}
};

run().catch((err) => {
	console.error(err);
	process.exit(1);
});
