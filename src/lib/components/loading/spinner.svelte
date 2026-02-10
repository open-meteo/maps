<script lang="ts">
	import { fade } from 'svelte/transition';
</script>

<div
	in:fade={{ delay: 400, duration: 400 }}
	out:fade={{ duration: 150 }}
	class="pointer-events-none absolute top-[50%] left-[50%] z-50 transform-[translate(-50%,-50%)]"
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="48"
		height="48"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		class="lucide lucide-loader-circle-icon lucide-loader-circle animate-spin"
		><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg
	>
</div>
