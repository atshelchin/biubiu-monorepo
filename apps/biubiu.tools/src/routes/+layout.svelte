<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { initSettings } from '$lib/settings';
	import { i18nState } from '@shelchin/i18n';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import TranslateModeBar from '$lib/components/TranslateModeBar.svelte';

	// Import CSS (order matters: tokens first, then themes, then global)
	import '../style/tokens.css';
	import '../style/theme-dark.css';
	import '../style/theme-light.css';
	import '../style/global.css';

	let { children, data } = $props();

	// Update i18nState when navigation completes (not during preload)
	$effect(() => {
		if (browser && data.messages && data.locale) {
			i18nState.setMessages(data.messages);
			i18nState.locale = data.locale;
		}
	});

	// Initialize settings (theme, text-scale, etc.) on client mount
	onMount(() => {
		initSettings();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<TranslateModeBar />
{@render children()}
