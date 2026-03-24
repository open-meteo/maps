import { get } from 'svelte/store';

import { toast } from 'svelte-sonner';

import { time } from './stores/time';
import { domain, variable } from './stores/variables';
import { formatISOWithoutTimezone } from './time-format';

let _staticSnapshotLink: HTMLAnchorElement | null = null;

export const takeSnapshot = (map: maplibregl.Map) => {
	const currentDomain = get(domain);
	const currentVariable = get(variable);
	const currentTime = get(time);
	const timeStr = currentTime
		? formatISOWithoutTimezone(currentTime).replace(/[:.]/g, '-')
		: 'unknown';
	const filename = `openmeteo_maps_${currentDomain}_${currentVariable}_${timeStr}.png`;

	map.once('render', async () => {
		const canvas = map!.getCanvas();

		// Capture attribution text from DOM
		const attribEl = map.getContainer().querySelector('.maplibregl-ctrl-attrib-inner');
		const attributionText = attribEl?.textContent?.replace(/\s+/g, ' ').trim() || '';

		try {
			const offscreen = new OffscreenCanvas(canvas.width, canvas.height);
			const ctx = offscreen.getContext('2d');
			if (!ctx) throw new Error('Failed to get offscreen context');
			ctx.drawImage(canvas, 0, 0);

			// Add attribution watermark
			const dpr = window.devicePixelRatio || 1;
			const fontSize = Math.round(24 * dpr);
			ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
			ctx.textBaseline = 'bottom';
			ctx.textAlign = 'right';

			const padding = 8 * dpr;
			const x = offscreen.width - padding;
			const y = offscreen.height - padding;

			// Add shadow for legibility on light/dark backgrounds
			ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
			ctx.shadowBlur = 4 * dpr;
			ctx.fillStyle = 'white';

			ctx.fillText(attributionText, x, y);

			// Convert to Blob to download
			const blob = await offscreen.convertToBlob({ type: 'image/png' });
			const dataURL = URL.createObjectURL(blob);

			if (!_staticSnapshotLink) {
				_staticSnapshotLink = document.createElement('a');
				_staticSnapshotLink.style.display = 'none';
				document.body.appendChild(_staticSnapshotLink);
			}

			_staticSnapshotLink.href = dataURL;
			_staticSnapshotLink.download = filename;
			_staticSnapshotLink.click();

			toast('Snapshot saved');
		} catch (e) {
			console.error(e);
			toast.error(
				'Snapshot failed — try enabling "Preserve drawing buffer" in settings or check browser permissions.'
			);
		}
	});
	map.triggerRepaint();
};
