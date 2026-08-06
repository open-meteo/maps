<script lang="ts">
	/**
	 * A compass rose with the wind drawn across it and a barb laid over it, to
	 * show how the symbol reads: the arrow flies the way the wind blows, while
	 * the barb's staff points back at where it came from.
	 */
	import { SHAPE_UNITS, barbShape, shapePath } from '$lib/arrow-shapes';

	interface Props {
		/** Meteorological direction the wind comes from, in degrees. */
		direction?: number;
		knots?: number;
	}

	let { direction = 135, knots = 25 }: Props = $props();

	const centre = SHAPE_UNITS / 2;

	/** Point at `degrees` clockwise from north, `radius` out from the centre. */
	const polar = (degrees: number, radius: number): [number, number] => {
		const radians = (degrees * Math.PI) / 180;
		return [centre + radius * Math.sin(radians), centre - radius * Math.cos(radians)];
	};

	const path = (points: [number, number][]): string =>
		'M' + points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z';

	// Eight-point star: long points to the cardinals, short ones between, each
	// split down the middle so one half catches the light
	const CARDINAL_RADIUS = 40;
	const DIAGONAL_RADIUS = 33;
	const BASE_RADIUS = 9;
	const star = [0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
		const tip = polar(angle, angle % 90 === 0 ? CARDINAL_RADIUS : DIAGONAL_RADIUS);
		return {
			light: path([polar(angle - 45, BASE_RADIUS), tip, [centre, centre]]),
			dark: path([polar(angle + 45, BASE_RADIUS), tip, [centre, centre]])
		};
	});

	const compass = [
		{ label: 'N', angle: 0 },
		{ label: 'E', angle: 90 },
		{ label: 'S', angle: 180 },
		{ label: 'W', angle: 270 }
	].map(({ label, angle }) => {
		const [x, y] = polar(angle, 47);
		// Nudged onto the text's optical centre rather than its baseline
		return { label, x, y: y + 3.2 };
	});

	// The wind blows away from where it comes from, so the head is half a turn
	// round from the direction
	const blowsTo = $derived(direction + 180);
	const windTail = $derived(polar(direction, 38));
	const windHead = $derived(polar(blowsTo, 50));
	const windHeadWings = $derived(
		path([polar(blowsTo - 10, 37), windHead, polar(blowsTo + 10, 37)])
	);
	const windLabel = $derived(polar(blowsTo, 50 + 9));

	const shape = $derived(barbShape(knots));
	/** The barb sits inside the rose rather than spanning it. */
	const BARB_SCALE = 0.75;
	// Divided by the scale, so shrinking the symbol does not also thin its line
	const stroke = 3 / BARB_SCALE;
</script>

<svg
	viewBox="-6 -6 {SHAPE_UNITS + 12} {SHAPE_UNITS + 12}"
	class="size-24 shrink-0"
	fill="none"
	stroke="currentColor"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#each star as point, i (i)}
		<path d={point.light} class="fill-current opacity-10" stroke="none" />
		<path d={point.dark} class="fill-current opacity-20" stroke="none" />
		<path d={point.light} class="opacity-20" stroke-width="0.8" />
		<path d={point.dark} class="opacity-20" stroke-width="0.8" />
	{/each}

	{#each compass as mark (mark.label)}
		<text
			x={mark.x}
			y={mark.y}
			text-anchor="middle"
			font-size="11"
			fill="currentColor"
			stroke="none"
			class="opacity-90">{mark.label}</text
		>
	{/each}

	<!-- The wind itself: from the tail, through the rose, out at the head -->
	<g class="text-red-500 dark:text-red-400" stroke="currentColor" stroke-width="2">
		<line x1={windTail[0]} y1={windTail[1]} x2={windHead[0]} y2={windHead[1]} />
		<path d={windHeadWings} fill="currentColor" />
		<text
			x={windLabel[0]}
			y={windLabel[1]}
			text-anchor="middle"
			font-size="10"
			font-weight="600"
			fill="currentColor"
			stroke="none">WIND</text
		>
	</g>

	<g
		transform="rotate({direction} {centre} {centre}) translate({centre} {centre}) scale({BARB_SCALE}) translate({-centre} {-centre})"
		stroke-width={stroke}
	>
		<path d={shapePath(shape.lines)} />
		<path d={shapePath(shape.pennants)} fill="currentColor" />
	</g>
</svg>
