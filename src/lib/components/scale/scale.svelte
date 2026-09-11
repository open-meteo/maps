<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';

	import { preferences } from '$lib/stores/preferences';
	import { variable } from '$lib/stores/variables';

	import ScaleLegend from './scale-legend.svelte';

	interface Props {
		editable?: boolean;
	}

	let { editable = true }: Props = $props();

	const desktop = new MediaQuery('min-width: 768px');
</script>

{#if $preferences.showScale}
	<div
		class="absolute z-60 {!desktop.current
			? 'bottom-22.5'
			: 'bottom-2.5'} duration-500 left-2.5 z-10 flex items-end gap-0.5"
	>
		<ScaleLegend variable={$variable} {editable} />
	</div>
{/if}
