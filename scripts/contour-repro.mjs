// Temporary repro driver for the z0-1 contour artefacts (not for commit).
// Usage: node scripts/contour-repro.mjs <outDir> [hash...]
import { chromium } from '/home/vincent/Projects/open-meteo/node_modules/playwright/index.mjs';

const outDir = process.argv[2] ?? '/tmp/claude';
const hashes = process.argv.length > 3 ? process.argv.slice(3) : ['0/30/10', '1/45/10', '2/48/15', '4/48/15'];

const proxyUrl = process.env.HTTPS_PROXY;
let proxy;
if (proxyUrl) {
	const u = new URL(proxyUrl);
	proxy = {
		server: `${u.protocol}//${u.host}`,
		username: decodeURIComponent(u.username),
		password: decodeURIComponent(u.password),
		bypass: 'localhost'
	};
}

const env = { ...process.env };
delete env.DISPLAY;
delete env.WAYLAND_DISPLAY;

const browser = await chromium.launch({
	args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
	proxy,
	env
});
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.on('console', (msg) => {
	if (msg.type() === 'error') console.log('console error:', msg.text().slice(0, 200));
});

for (const hash of hashes) {
	const url = `http://localhost:5173/?domain=ncep_gfs025&variable=pressure_msl&contours=true#${hash}`;
	console.log('goto', url);
	await page.goto(url, { waitUntil: 'load', timeout: 60000 });
	await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
	await page.waitForTimeout(8000);
	const name = `contours-z${hash.split('/')[0]}.png`;
	await page.screenshot({ path: `${outDir}/${name}` });
	console.log('saved', name);
}
await browser.close();
