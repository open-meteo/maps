<script lang="ts">
	import {
		alphaToPercent,
		hexToRgb,
		hsvToRgb,
		isValidHex,
		percentToAlpha,
		rgbToHex,
		rgbToHsv
	} from '$lib/color';

	interface Props {
		color: string;
		onchange: (color: string, alpha: number) => void;
		onclose: () => void;
		initialAlpha?: number;
	}

	let { color, onchange, onclose, initialAlpha = 1 }: Props = $props();

	let hue = $state(0);
	let saturation = $state(100);
	let brightness = $state(100);
	let alpha = $derived(initialAlpha);
	let hexInput = $derived(color.slice(0, 7));

	let satBrightRef: HTMLDivElement | null = $state(null);
	let hueRef: HTMLDivElement | null = $state(null);
	let alphaRef: HTMLDivElement | null = $state(null);

	type DragTarget = 'satBright' | 'hue' | 'alpha' | null;
	let dragging: DragTarget = $state(null);

	$effect(() => {
		const rgb = hexToRgb(color);
		if (rgb) {
			const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
			hue = hsv.h;
			saturation = hsv.s;
			brightness = hsv.v;
		}
		hexInput = color.slice(0, 7);
	});

	$effect(() => {
		alpha = initialAlpha;
	});

	const currentRgb = $derived(hsvToRgb(hue, saturation, brightness));
	const currentHex = $derived(rgbToHex(currentRgb.r, currentRgb.g, currentRgb.b));
	const hueRgb = $derived(hsvToRgb(hue, 100, 100));
	const hueColor = $derived(rgbToHex(hueRgb.r, hueRgb.g, hueRgb.b));
	const alphaPercent = $derived(alphaToPercent(alpha));
	const getClientPosition = (e: MouseEvent | TouchEvent) => {
		return 'touches' in e
			? { x: e.touches[0].clientX, y: e.touches[0].clientY }
			: { x: e.clientX, y: e.clientY };
	};

	const getNormalizedPosition = (e: MouseEvent | TouchEvent, ref: HTMLElement | null) => {
		if (!ref) return { x: 0, y: 0 };
		const rect = ref.getBoundingClientRect();
		const { x: clientX, y: clientY } = getClientPosition(e);
		return {
			x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
			y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
		};
	};

	const handleSatBrightMove = (e: MouseEvent | TouchEvent) => {
		const { x, y } = getNormalizedPosition(e, satBrightRef);
		saturation = x * 100;
		brightness = (1 - y) * 100;
		hexInput = currentHex;
	};

	const handleHueMove = (e: MouseEvent | TouchEvent) => {
		const { x } = getNormalizedPosition(e, hueRef);
		hue = x * 360;
		hexInput = currentHex;
	};

	const handleAlphaMove = (e: MouseEvent | TouchEvent) => {
		const { x } = getNormalizedPosition(e, alphaRef);
		alpha = x;
	};

	const handleDragStart = (target: DragTarget, e: MouseEvent | TouchEvent) => {
		dragging = target;
		handleDragMove(e);
	};

	const handleDragMove = (e: MouseEvent | TouchEvent) => {
		switch (dragging) {
			case 'satBright':
				handleSatBrightMove(e);
				break;
			case 'hue':
				handleHueMove(e);
				break;
			case 'alpha':
				handleAlphaMove(e);
				break;
		}
	};

	const handleDragEnd = () => {
		dragging = null;
	};

	const handleHexInput = (e: Event) => {
		const value = (e.target as HTMLInputElement).value;
		hexInput = value;

		if (isValidHex(value)) {
			const rgb = hexToRgb(value);
			if (rgb) {
				const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
				hue = hsv.h;
				saturation = hsv.s;
				brightness = hsv.v;
			}
		}
	};

	const handleAlphaInput = (e: Event) => {
		const value = parseInt((e.target as HTMLInputElement).value);
		if (!isNaN(value)) {
			alpha = Math.max(0, Math.min(1, percentToAlpha(value)));
		}
	};

	const handleApply = () => {
		onchange(currentHex, alpha);
		onclose();
	};

	const handleClickOutside = (e: MouseEvent) => {
		const target = e.target as HTMLElement;
		if (!target.closest('.color-picker-content')) {
			onclose();
		}
	};
</script>

<svelte:window
	onmousemove={handleDragMove}
	onmouseup={handleDragEnd}
	ontouchmove={handleDragMove}
	ontouchend={handleDragEnd}
	onclick={handleClickOutside}
/>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="color-picker-content absolute left-full ml-2 z-50 bg-popover border border-border rounded-lg shadow-xl p-3 w-60"
	onclick={(e) => e.stopPropagation()}
	onkeydown={(e) => e.key === 'Escape' && onclose()}
>
	<!-- Saturation/Brightness Square -->
	<div
		bind:this={satBrightRef}
		class="relative w-full h-40 rounded cursor-crosshair mb-3 select-none"
		style="background: linear-gradient(to right, white, {hueColor});"
		onmousedown={(e) => handleDragStart('satBright', e)}
		ontouchstart={(e) => handleDragStart('satBright', e)}
		role="slider"
		aria-valuenow={Math.round(saturation)}
		aria-label="Saturation and brightness"
		tabindex="0"
	>
		<div
			class="absolute inset-0 rounded pointer-events-none"
			style="background: linear-gradient(to bottom, transparent, black);"
		></div>
		<div
			class="absolute w-4 h-4 border-2 border-white rounded-full shadow-md pointer-events-none"
			style="
				left: {saturation}%;
				top: {100 - brightness}%;
				transform: translate(-50%, -50%);
				background: {currentHex};
				box-shadow: 0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.2);
			"
		></div>
	</div>

	<!-- Hue Slider -->
	<div class="mb-3">
		<label class="text-xs text-muted-foreground mb-1 block" for="hue-slider">Hue</label>
		<div
			bind:this={hueRef}
			id="hue-slider"
			class="relative w-full h-3 rounded cursor-pointer select-none"
			style="background: linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000);"
			onmousedown={(e) => handleDragStart('hue', e)}
			ontouchstart={(e) => handleDragStart('hue', e)}
			role="slider"
			aria-valuenow={Math.round(hue)}
			aria-valuemin={0}
			aria-valuemax={360}
			tabindex="0"
		>
			<div
				class="absolute w-3 h-5 -top-1 border-2 border-white rounded shadow-md pointer-events-none"
				style="
					left: {(hue / 360) * 100}%;
					transform: translateX(-50%);
					background: {hueColor};
					box-shadow: 0 0 0 1px rgba(0,0,0,0.3);
				"
			></div>
		</div>
	</div>

	<!-- Alpha/Opacity Slider -->
	<div class="mb-3">
		<label class="text-xs text-muted-foreground mb-1 block" for="alpha-slider">
			Opacity: {alphaPercent}%
		</label>
		<div
			bind:this={alphaRef}
			id="alpha-slider"
			class="relative w-full h-3 rounded cursor-pointer select-none"
			style="
				background:
					linear-gradient(to right, transparent, {currentHex}),
					repeating-conic-gradient(#808080 0% 25%, #fff 0% 50%) 50% / 8px 8px;
			"
			onmousedown={(e) => handleDragStart('alpha', e)}
			ontouchstart={(e) => handleDragStart('alpha', e)}
			role="slider"
			aria-valuenow={alphaPercent}
			aria-valuemin={0}
			aria-valuemax={100}
			tabindex="0"
		>
			<div
				class="absolute w-3 h-5 -top-1 border-2 border-white rounded shadow-md pointer-events-none"
				style="
					left: {alpha * 100}%;
					transform: translateX(-50%);
					background: {currentHex};
					opacity: {alpha};
					box-shadow: 0 0 0 1px rgba(0,0,0,0.3);
				"
			></div>
		</div>
	</div>

	<!-- Color Preview and Inputs -->
	<div class="flex gap-2 items-center mb-3">
		<div
			class="w-10 h-10 rounded border border-border shadow-inner relative overflow-hidden"
			style="background: repeating-conic-gradient(#808080 0% 25%, #fff 0% 50%) 50% / 8px 8px;"
			aria-label="Color preview"
		>
			<div class="absolute inset-0" style="background: {currentHex}; opacity: {alpha};"></div>
		</div>
		<div class="flex-1 flex flex-col gap-1">
			<input
				type="text"
				value={hexInput}
				oninput={handleHexInput}
				class="w-full px-2 py-1 text-sm font-mono bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring"
				placeholder="#000000"
				maxlength="7"
				aria-label="Hex color value"
			/>
			<div class="flex items-center gap-1">
				<input
					type="number"
					value={alphaPercent}
					oninput={handleAlphaInput}
					min="0"
					max="100"
					class="w-16 px-2 py-1 text-sm bg-background border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring"
					aria-label="Opacity percentage"
				/>
				<span class="text-xs text-muted-foreground">%</span>
			</div>
		</div>
	</div>

	<!-- RGBA Display -->
	<div class="text-xs text-muted-foreground mb-3 font-mono">
		rgba({Math.round(currentRgb.r)}, {Math.round(currentRgb.g)}, {Math.round(currentRgb.b)}, {alpha.toFixed(
			2
		)})
	</div>

	<!-- Action Buttons -->
	<div class="flex gap-2">
		<button
			type="button"
			onclick={onclose}
			class="flex-1 px-3 py-1.5 text-sm bg-muted hover:bg-muted/80 rounded transition-colors"
		>
			Cancel
		</button>
		<button
			type="button"
			onclick={handleApply}
			class="flex-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground hover:bg-primary/90 rounded transition-colors"
		>
			Apply
		</button>
	</div>
</div>
