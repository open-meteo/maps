<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { resetStates, url } from '$lib/stores/preferences';
	import { domain } from '$lib/stores/variables';

	import Button from '$lib/components/ui/button/button.svelte';

	import { changeOMfileURL, updateUrl } from '$lib';

	import { reloadStyles } from '../buttons';

	const reset = () => {
		resetStates();
		for (let [key] of $url.searchParams) {
			$url.searchParams.delete(key);
		}
		reloadStyles();
		$domain = $domain; // reload domainData
		changeOMfileURL();
		updateUrl();
		toast.info('All default states reset');
	};
</script>

<div class="mt-auto justify-self-end">
	<h2 class="text-lg font-bold">States</h2>
	<div class="mt-3">
		<Button class="cursor-pointer" onclick={reset}>Reset all states</Button>
	</div>
</div>
