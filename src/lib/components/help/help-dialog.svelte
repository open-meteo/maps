<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';

	import { browser } from '$app/environment';

	import { helpOpen, typing } from '$lib/stores/preferences';

	import * as Dialog from '$lib/components/ui/dialog';
	import * as Kbd from '$lib/components/ui/kbd';

	const keydownEvent = (event: KeyboardEvent) => {
		if ($typing) return;
		switch (event.key) {
			case 'h':
				$helpOpen = !$helpOpen;
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

	const smallerDesktop = new MediaQuery('min-width: 640px');
</script>

<Dialog.Root bind:open={$helpOpen}>
	<Dialog.Content class="min-h-1/4 max-h-[90vh] overflow-y-scroll pb-18 border-none">
		<Dialog.Header>
			<Dialog.Title class="text-2xl">Help</Dialog.Title>
		</Dialog.Header>
		{#if smallerDesktop.current}
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div class="flex flex-col">
					<div class="flex items-center mb-2 gap-1.25 -ml-0.5">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							opacity="0.75"
							stroke-width="1.75"
							width="23"
							height="23"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="lucide lucide-calendar-off-icon lucide-calendar-off"
							><path d="M16 14v2.2l1.6 1"></path><path d="M16 2v4"></path><path
								d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"
							></path><path d="M3 10h5"></path><path d="M8 2v4"></path><circle cx="16" cy="16" r="6"
							></circle></svg
						>
						<h2 class="text-lg font-bold">Time Selector</h2>
					</div>
					<div class="flex flex-col gap-1">
						<div class="flex items-center gap-2">
							<Kbd.Root>↓</Kbd.Root> Previous Day
						</div>
						<div class="flex items-center gap-2">
							<Kbd.Root>↑</Kbd.Root> Next Day
						</div>
						<div class="flex items-center gap-2">
							<Kbd.Root>←</Kbd.Root> Previous Hour
						</div>
						<div class="flex items-center gap-2">
							<Kbd.Root>→</Kbd.Root> Next Hour
						</div>
						<div class="flex items-center gap-2">
							<Kbd.Root>c</Kbd.Root> Jump to Current Time
						</div>
						<div class="flex items-center gap-2">
							<Kbd.Root>m</Kbd.Root> Lock Model Run
						</div>
						<div class="flex items-center gap-2">
							<Kbd.Root>n</Kbd.Root> Latest Model Run
						</div>
						<div class="mt-3 flex items-center gap-2">
							<Kbd.Root>ctrl</Kbd.Root> +
							<Kbd.Root>←</Kbd.Root> Previous Model Run
						</div>
						<div class="flex items-center gap-2">
							<Kbd.Root>ctrl</Kbd.Root> +
							<Kbd.Root>→</Kbd.Root> Next Model Run
						</div>
					</div>
				</div>

				<div>
					<div class="flex items-center mb-2 gap-1.25 -ml-0.5">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							opacity="0.75"
							stroke-width="1.75"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="lucide lucide-variable-icon lucide-variable"
							><path d="M8 21s-4-3-4-9 4-9 4-9"></path><path d="M16 3s4 3 4 9-4 9-4 9"></path><line
								x1="15"
								x2="9"
								y1="9"
								y2="15"
							></line><line x1="9" x2="15" y1="9" y2="15"></line></svg
						>
						<h2 class="text-lg font-bold">Variables</h2>
					</div>
					<div class="flex flex-col gap-1">
						<div class="flex items-center gap-2">
							<Kbd.Root>d</Kbd.Root> Domain Selection
						</div>
						<div class="flex items-center gap-2">
							<Kbd.Root>v</Kbd.Root> Variable Selection
						</div>
						<div class="flex items-center gap-2">
							<Kbd.Root>l</Kbd.Root> Level Selection
						</div>
					</div>
				</div>
			</div>
		{/if}
		<div>
			<div class="flex items-center mb-2 gap-1.5 -ml-0.5">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="23"
					height="23"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					opacity="0.75"
					stroke-width="1.75"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="lucide lucide-toggle-left-icon lucide-toggle-left"
					><circle cx="9" cy="12" r="3" /><rect width="20" height="14" x="2" y="5" rx="7" /></svg
				>
				<h2 class="text-lg font-bold">Buttons</h2>
			</div>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div class="flex flex-col gap-3">
					<div class="flex items-center gap-2">
						<div class="maplibregl-ctrl maplibregl-ctrl-group">
							<button
								class="maplibregl-ctrl-zoom-in"
								type="button"
								title="Zoom in"
								aria-label="Explanation Zoom in"
								aria-disabled="false"
								><span class="maplibregl-ctrl-icon" aria-hidden="true"></span></button
							><button
								class="maplibregl-ctrl-zoom-out"
								type="button"
								title="Zoom out"
								aria-label="Explanation Zoom out"
								aria-disabled="false"
								><span class="maplibregl-ctrl-icon" aria-hidden="true"></span></button
							><button
								class="maplibregl-ctrl-compass"
								type="button"
								title="Reset bearing to north"
								aria-label="Explanation Reset bearing to north"
								><span
									class="maplibregl-ctrl-icon"
									aria-hidden="true"
									style="transform: scale(1) rotateZ(0deg) rotateX(0deg) rotateZ(0deg);"
								></span></button
							>
						</div>
						<div class="flex flex-col gap-1.75">
							<div class="truncate">Zoom in</div>
							<div class="truncate">Zoom out</div>
							<div class="truncate">Reset tilt / rotation</div>
						</div>
					</div>

					<div class="flex items-center gap-2">
						<div class="maplibregl-ctrl maplibregl-ctrl-group">
							<button
								class="maplibregl-ctrl-geolocate"
								type="button"
								title="Find my location"
								aria-label="Explanation Find my location"
								aria-pressed="false"
								><span class="maplibregl-ctrl-icon" aria-hidden="true"></span></button
							>
						</div>
						<div class="truncate">Locate User</div>
					</div>

					<div class="flex items-center gap-2">
						<div class="maplibregl-ctrl maplibregl-ctrl-group">
							<button
								class="maplibregl-ctrl-globe"
								aria-label="Explanation Globe Button"
								type="button"
								title="Enable globe"
								><span class="maplibregl-ctrl-icon" aria-hidden="true"></span></button
							>
						</div>
						<div class="truncate">Globe Projection</div>
					</div>
					<div class="flex items-center gap-2">
						<div title="Darkmode" class="maplibregl-ctrl maplibregl-ctrl-group">
							<button
								aria-label="Explanation Darkmode Button"
								style="display:flex;justify-content:center;align-items:center;"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									opacity="0.75"
									stroke-width="1.2"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="lucide lucide-moon-icon lucide-moon"
									><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg
								>
							</button>
						</div>
						<div class="truncate">Darkmode / Brightmode</div>
					</div>
				</div>
				<div class="flex flex-col gap-3">
					<div class="flex items-center gap-2">
						<div title="Settings" class="maplibregl-ctrl maplibregl-ctrl-group">
							<button
								style="display:flex;justify-content:center;align-items:center;"
								aria-label="Explanation Settings Button"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									opacity="0.75"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.2"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="lucide lucide-settings-icon lucide-settings"
									><path
										d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
									></path><circle cx="12" cy="12" r="3"></circle></svg
								>
							</button>
						</div>
						<div class="truncate">Additional Settings</div>
					</div>
					<div class="flex items-center gap-2">
						<div class="maplibregl-ctrl maplibregl-ctrl-group" title="Time selector">
							<button
								style="display:flex;justify-content:center;align-items:center;"
								aria-label="Explanation Time Selector Button"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									opacity="0.75"
									stroke-width="1.2"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="lucide lucide-calendar-off-icon lucide-calendar-off"
									><path d="M16 14v2.2l1.6 1"></path><path d="M16 2v4"></path><path
										d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"
									></path><path d="M3 10h5"></path><path d="M8 2v4"></path><circle
										cx="16"
										cy="16"
										r="6"
									></circle></svg
								>
							</button>
						</div>
						<div class="truncate">Enable / Disable Time Selector</div>
					</div>

					<div class="flex items-center gap-2">
						<div class="maplibregl-ctrl maplibregl-ctrl-group" title="Hillshade">
							<button
								style="display:flex;justify-content:center;align-items:center;"
								aria-label="Explanation Hillshade Button"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									opacity="0.75"
									stroke-width="1.2"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="lucide lucide-mountain-snow-icon lucide-mountain-snow"
									><path d="m8 3 4 8 5-5 5 15H2L8 3z"></path><path
										d="M4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19"
									></path></svg
								>
							</button>
						</div>
						<div class="truncate">Hillshade</div>
					</div>

					<div class="flex items-center gap-2">
						<div class="maplibregl-ctrl maplibregl-ctrl-group">
							<button
								class="maplibregl-ctrl-terrain"
								aria-label="Explanation 3D Terrain Button"
								type="button"
								title="Enable terrain"
								><span class="maplibregl-ctrl-icon opacity-75" aria-hidden="true"></span></button
							>
						</div>
						<div class="truncate">3D Terrain</div>
					</div>

					<div class="flex items-center gap-2">
						<button
							style="box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 0px 2px;"
							class="bg-background/90 dark:bg-background/70 hover:!bg-background flex h-7.25 w-7.25 cursor-pointer items-center rounded-[4px] p-0"
							aria-label="Hide Variable Selection"
							><svg
								opacity="0.75"
								xmlns="http://www.w3.org/2000/svg"
								width="17"
								height="17"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="lucide lucide-chevron-left-icon lucide-chevron-left -mr-1.25"
								><path d="m9 18 6-6-6-6" /></svg
							>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								opacity="0.65"
								stroke-width="1.75"
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="lucide lucide-variable-icon lucide-variable"
								><path d="M8 21s-4-3-4-9 4-9 4-9"></path><path d="M16 3s4 3 4 9-4 9-4 9"
								></path><line x1="15" x2="9" y1="9" y2="15"></line><line
									x1="9"
									x2="15"
									y1="9"
									y2="15"
								></line></svg
							></button
						>
						<div class="truncate">Show / Hide Variable Selection</div>
					</div>
				</div>
			</div>
		</div>
		<div>
			<div class="flex mb-2 items-center gap-1.25 -ml-0.5">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					opacity="0.75"
					stroke-width="1.75"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="lucide lucide-settings-icon lucide-settings"
					><path
						d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
					></path><circle cx="12" cy="12" r="3"></circle></svg
				>
				<h2 class=" text-lg font-bold">Additional Settings</h2>
			</div>
			<div class="grid grid-cols-1 sm:gap-3 sm:grid-cols-2">
				<div>
					<div><b>Units</b> - WIP</div>
					<b>Grid</b> - Show individual model grid points as orange dots on map
					<div>
						<b>Arrows</b> - Show directional arrows on maps with speed and direction (wind / wave)
					</div>
					<div><b>Contours</b> - Show contour lines between certain thresholds</div>
				</div>
				<div>
					<div>
						<b>Resolution</b> - Resolution factor for the generated tiles, for Retina / HD Displays
						a factor of <b><i>2</i></b> is recommended, otherwise <b><i>1</i></b> will suffice
					</div>
					<div>
						<b>Tile Size</b> - Size in pixels of the generated tiles, <b><i>256</i></b> recommended
					</div>
					<div>
						<b>Partial Requests</b> - Only request the data of the current viewport. Will update on zoom
						/ pan
					</div>
					<div>
						<b>Clip Water</b> - Overlay the oceans over the generated tiles. Makes sense for certain variables
						like 'Soil Temperature' where values in the oceans don't represent anything
					</div>
				</div>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
