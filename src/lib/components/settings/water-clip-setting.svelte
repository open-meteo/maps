<script lang="ts">
	import Button from '../ui/button/button.svelte';
</script>

<div>
	<!-- <Button
		onclick={() => {
			preferences.clipWater = !preferences.clipWater;
			p.set(preferences);
			div.innerHTML = preferences.clipWater ? clipWater : dontClipWater;
			if (preferences.clipWater) {
				this.url.searchParams.set('clip-water', String(preferences.clipWater));
			} else {
				this.url.searchParams.delete('clip-water');
			}
			pushState(this.url + this.map._hash.getHashString(), {});
			getStyle().then((style) => {
				this.map.setStyle(style);
				this.map.once('styledata', () => {
					setTimeout(() => {
						addOmFileLayers(this.map);
						addHillshadeSources(this.map);
						if (preferences.hillshade) {
							addHillshadeLayer(this.map);
						}
					}, 50);
				});
			});
		}}
	>
		Clip Water</Button
	> -->
</div>
