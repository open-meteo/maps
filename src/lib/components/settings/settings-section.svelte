<script lang="ts">
	import { slide } from 'svelte/transition';

	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';

	import { collapsedSettings } from '$lib/stores/preferences';

	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		children: Snippet;
		/** Greys the section out (its settings have no effect right now). */
		disabled?: boolean;
		/** Why the section is disabled, shown under the header. */
		note?: string;
	}

	let { title, children, disabled = false, note }: Props = $props();

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
		<h2 class="text-lg font-bold {disabled ? 'opacity-50' : ''}">{title}</h2>
		<ChevronDownIcon class="size-4 shrink-0 opacity-60 duration-200 {open ? '' : '-rotate-90'}" />
	</button>
	{#if open}
		<!-- The room a section needs sits inside it: collapsed ones are only a
			header, and the gap in the sheet no longer has to carry both cases -->
		<div class="pb-4" transition:slide={{ duration: 150 }}>
			{#if disabled && note}
				<p class="mt-1 text-xs opacity-75">{note}</p>
			{/if}
			<div class={disabled ? 'pointer-events-none opacity-50' : ''} aria-disabled={disabled}>
				{@render children()}
			</div>
		</div>
	{/if}
</section>
