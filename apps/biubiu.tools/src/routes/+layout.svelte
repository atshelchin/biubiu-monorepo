<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { i18nState } from '@shelchin/i18n';

	let { children, data } = $props();

	// Update i18n state when data changes (client-side navigation)
	$effect(() => {
		if (data.messages && data.locale) {
			i18nState.setMessages(data.messages);
			i18nState.locale = data.locale;
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
