<script lang="ts">
	import { env } from '$env/dynamic/public';
	console.log('PORT =>', env.PORT);
	console.log('DATABASE_URL =>', env.DATABASE_URL);
	console.log('API_KEY =>', env.API_KEY);
	console.log('PUBLIC_APP_NAME =>', env.PUBLIC_APP_NAME);
</script>

<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>
