<script lang="ts">
	import Button from '../ui/button/button.svelte';
</script>

<div>
	<!-- <Button
		onclick={() => {
			preferences.partial = !preferences.partial;
			p.set(preferences);
			div.innerHTML = preferences.partial ? partialSVG : fullSVG;
			if (preferences.partial) {
				this.url.searchParams.set('partial', String(preferences.partial));
				getPaddedBounds(this.map);
			} else {
				this.url.searchParams.delete('partial');
				this.map.removeLayer('paddedBoundsLayer');
				this.map.removeSource('paddedBoundsSource');
				paddedBoundsLayer.set(undefined);
				paddedBoundsSource.set(undefined);
			}
			pushState(this.url + this.map._hash.getHashString(), {});
			changeOMfileURL(this.map, this.url, this.latest);
		}}
	>
		Clip Water</Button
	> -->
</div>
