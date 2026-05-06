<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { initSettings } from '$lib/settings';
	import { i18nState } from '@shelchin/i18n-sveltekit';
	import { onMount } from 'svelte';
	// Import CSS (order matters: tokens first, then themes, then global)
	import '../style/tokens.css';
	import '../style/theme-dark.css';
	import '../style/theme-light.css';
	import '../style/global.css';

	let { children, data } = $props();

	// Keep i18nState in sync with data from load function.
	// Use $derived to ensure it runs before child components render.
	const _syncMessages = $derived.by(() => {
		if (data.messages && data.locale) {
			i18nState.setMessages(data.messages);
			i18nState.locale = data.locale;
		}
		return true;
	});

	// Initialize settings (theme, text-scale, etc.) on client mount
	onMount(() => {
		initSettings();

		navigator.modelContext?.registerTool({
			name: 'get_page_title',
			description: 'Get the current page title',
			inputSchema: { type: 'object', properties: {} },
			execute: async () => ({ content: [{ type: 'text', text: document.title }] })
		});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
