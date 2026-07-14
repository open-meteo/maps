// Temporary probe: measure dashed-border vs raster-band alignment for
// ncep_gfswave016 across viewport sizes. Delete after use.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 5173;
const base = process.env.BASE_URL ?? `http://localhost:${PORT}`;

const waitForServer = async (url, timeoutMs = 120_000) => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(url);
			if (res.ok) return true;
		} catch {
			/* not up yet */
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	return false;
};

let child;
if (!(await waitForServer(base, 2_000))) {
	child = spawn('npm', ['run', 'dev', '--', '--port', String(PORT), '--strictPort'], {
		cwd: new URL('..', import.meta.url).pathname,
		stdio: ['ignore', 'ignore', 'inherit']
	});
	if (!(await waitForServer(base))) throw new Error('dev server not ready');
}

const browser = await chromium.launch({ headless: true });
for (const [w, h] of [
	[1025, 900],
	[1127, 800],
	[1440, 700],
	[820, 720]
]) {
	const context = await browser.newContext({ viewport: { width: w, height: h } });
	const page = await context.newPage();
	await page.goto(`${base}/?screenshot=1&domain=ncep_gfswave016&variable=wave_height&padding=90`, {
		waitUntil: 'domcontentloaded'
	});
	try {
		await page.waitForFunction('window.__omScreenshotReady === true', { timeout: 90_000 });
	} catch {
		console.log(`${w}x${h}: no ready signal, measuring anyway`);
	}
	await page.waitForTimeout(600);
	const png = await page.screenshot({ type: 'png' });

	// zoom/center for reference
	const cam = await page.evaluate(() => {
		const m = document.querySelector('.maplibregl-map');
		return m ? 'map found' : 'no map el';
	});

	const { PNG } = await import('pngjs').catch(() => ({ PNG: null }));
	// decode via playwright's own sharp-free path: use raw canvas? simplest: decode with sharp from maps deps
	const { createRequire } = await import('node:module');
	const sharp = createRequire(new URL('../package.json', import.meta.url).pathname)('sharp');
	const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
	const px = (x, y) => {
		const i = (y * info.width + x) * info.channels;
		return [data[i], data[i + 1], data[i + 2]];
	};
	// dashed border rows: rows where many pixels are the deep dashed blue
	const rowCounts = new Array(info.height).fill(0);
	for (let y = 0; y < info.height; y++)
		for (let x = 0; x < info.width; x += 2) {
			const [r, g, b] = px(x, y);
			if (b > 150 && r < 80 && g < 110) rowCounts[y]++;
		}
	const borderRows = rowCounts
		.map((c, y) => [y, c])
		.filter(([, c]) => c > info.width / 20)
		.map(([y]) => y);
	// raster band extremes across sample columns (ocean columns dominate min/max)
	let first = Infinity,
		last = -Infinity;
	for (let x = 20; x < info.width; x += 25) {
		for (let y = 0; y < info.height; y++) {
			const [r, g, b] = px(x, y);
			const teal = g > 150 && b > 120 && r < 160 && g > r + 20;
			if (teal) {
				if (y < first) first = y;
				if (y > last) last = y;
			}
		}
	}
	const groups = [];
	for (const y of borderRows) {
		const g = groups[groups.length - 1];
		if (g && y - g[g.length - 1] <= 3) g.push(y);
		else groups.push([y]);
	}
	const lines = groups.map((g) => g[Math.floor(g.length / 2)]);
	console.log(
		`${w}x${h} (${cam}): border lines y=${lines.join(',')} | raster first=${first} last=${last} | gapTop=${first - (lines[0] ?? NaN)} gapBottom=${(lines[1] ?? NaN) - last}`
	);
	await context.close();
}
await browser.close();
child?.kill('SIGTERM');
