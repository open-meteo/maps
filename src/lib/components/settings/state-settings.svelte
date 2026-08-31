<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { resetStates, url } from '$lib/stores/preferences';
	import { domain } from '$lib/stores/variables';

	import Button from '$lib/components/ui/button/button.svelte';

	import { changeOMfileURL } from '$lib/layers';
	import { reloadStyles } from '$lib/map-controls';
	import { updateUrl } from '$lib/url';

	import SettingsSection from './settings-section.svelte';

	const reset = async () => {
		await resetStates();
		for (let [key] of $url.searchParams) {
			$url.searchParams.delete(key);
		}
		reloadStyles();
		$domain = $domain; // reload domainData
		await changeOMfileURL();
		updateUrl();
		toast.info('All default states reset');
	};
</script>

<div class="mt-auto justify-self-end">
	<SettingsSection title="States">
		<div class="mt-3">
			<Button class="cursor-pointer" onclick={reset}>Reset all states</Button>
		</div>
	</SettingsSection>
</div>
