<script lang="ts">
	import { slide } from 'svelte/transition';

	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';

	import { collapsedSettings } from '$lib/stores/preferences';

	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		children: Snippet;
	}

	let { title, children }: Props = $props();

	// Sections start open; only the ones a visitor collapsed are remembered
	const open = $derived(!$collapsedSettings[title]);

	const toggle = () => {
		collapsedSettings.update((state) => ({ ...state, [title]: open }));
	};
</script>

<section>
	<button
		type="button"
		class="hover:text-primary flex w-full cursor-pointer items-center justify-between gap-2 text-left duration-150"
		aria-expanded={open}
		onclick={toggle}
	>
		<h2 class="text-lg font-bold">{title}</h2>
		<ChevronDownIcon class="size-4 shrink-0 opacity-60 duration-200 {open ? '' : '-rotate-90'}" />
	</button>
	{#if open}
		<div transition:slide={{ duration: 150 }}>
			{@render children()}
		</div>
	{/if}
</section>
