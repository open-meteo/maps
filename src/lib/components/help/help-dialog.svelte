<script lang="ts">
	import * as Kbd from '$lib/components/ui/kbd';
	import * as Dialog from '$lib/components/ui/dialog';
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';

	const keydownEvent = (event: KeyboardEvent) => {
		switch (event.key) {
			case 'h':
				helpOpen = true;
				break;
		}
	};

	onMount(() => {
		if (browser) {
			window.addEventListener('keydown', keydownEvent);
		}
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('keydown', keydownEvent);
		}
	});

	let helpOpen = $state(false);
</script>

<Dialog.Root bind:open={helpOpen}>
	<Dialog.Content class="min-h-1/4">
		<Dialog.Header>
			<Dialog.Title>Help</Dialog.Title>
		</Dialog.Header>
		<div class="flex flex-col gap-3">
			<h2 class="text-lg">Time Selector</h2>
			<div class="flex flex-col gap-1 md:flex-row">
				<div>
					<Kbd.Root>↓</Kbd.Root> Previous Day
				</div>
				<div>
					<Kbd.Root>↑</Kbd.Root> Next Day
				</div>
				<div>
					<Kbd.Root>←</Kbd.Root> Previous Hour
				</div>
				<div>
					<Kbd.Root>→</Kbd.Root> Next Hour
				</div>
			</div>

			<h2 class="text-lg">Variables</h2>

			<div class="flex flex-col gap-1 md:flex-row">
				<div>
					<Kbd.Root>d</Kbd.Root> Domain Selection
				</div>
				<div>
					<Kbd.Root>v</Kbd.Root> Variable Selection
				</div>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
