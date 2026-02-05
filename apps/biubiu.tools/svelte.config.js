import adapter from "@shelchin/exe-sveltekit";

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			binaryName: "biubiu",
		}),
	},
};

export default config;
