<script lang="ts">
	import { t, localizeHref, locale } from '$lib/i18n';
</script>

<h1>{t('welcome')}</h1>
<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>

<nav>
	<a href={localizeHref('/')}>{t('nav.home')}</a>
	<span> | </span>
	<a href="/en">English</a>
	<span> | </span>
	<a href="/zh">中文</a>
</nav>

<p>Current locale: {locale.value}</p>
