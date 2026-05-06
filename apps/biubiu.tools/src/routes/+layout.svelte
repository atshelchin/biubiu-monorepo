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

	// Synchronously set messages on initial load (prevents hydration flash)
	if (data.messages && data.locale) {
		i18nState.setMessages(data.messages);
		i18nState.locale = data.locale;
	}

	// Update i18nState on client-side navigation
	$effect.pre(() => {
		if (data.messages && data.locale) {
			i18nState.setMessages(data.messages);
			i18nState.locale = data.locale;
		}
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
