import adapter from "@jesterkit/exe-sveltekit";

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			binaryName: "biubiu",
		}),
	},
};

export default config;
