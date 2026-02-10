import adapter from "@shelchin/exe-sveltekit";

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			binaryName: "biubiu",
		}),
		alias: {
			$i18n: "./.svelte-kit/types/$i18n",
		},
	},
};

export default config;
