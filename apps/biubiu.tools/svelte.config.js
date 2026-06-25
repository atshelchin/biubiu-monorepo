import adapter from "@shelchin/exe-sveltekit";
import { mdsvex, escapeSvelte } from "mdsvex";
import { createHighlighter } from "shiki";
import rehypeSlug from "rehype-slug";

// Build-time syntax highlighter. Shiki runs only during the build (Node) and
// emits self-contained, inline-styled HTML — so highlighted code ships zero JS
// to the client. `vesper` sits naturally on the biubiu dark/light palette.
const SHIKI_THEME = "vesper";
const highlighter = await createHighlighter({
	themes: [SHIKI_THEME],
	langs: [
		"text",
		"bash",
		"shell",
		"json",
		"jsonc",
		"javascript",
		"typescript",
		"tsx",
		"svelte",
		"html",
		"css",
		"diff",
		"yaml",
		"toml",
		"solidity",
		"markdown",
	],
});

/** @type {import('mdsvex').MdsvexOptions} */
const mdsvexOptions = {
	extensions: [".md"],
	// Give every heading a stable `id` so the docs table-of-contents and in-page
	// anchor links work.
	rehypePlugins: [rehypeSlug],
	highlight: {
		highlighter: async (code, lang = "text") => {
			const known = highlighter.getLoadedLanguages();
			const safeLang = known.includes(lang) ? lang : "text";
			const html = escapeSvelte(
				highlighter.codeToHtml(code, { lang: safeLang, theme: SHIKI_THEME }),
			);
			return `{@html \`${html}\`}`;
		},
	},
};

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Treat `.md` files as compilable components (handled by mdsvex below).
	extensions: [".svelte", ".md"],
	preprocess: [mdsvex(mdsvexOptions)],
	kit: {
		adapter: adapter({
			binaryName: "biubiu",
			target: process.env.BUILD_TARGET || undefined,
		}),
		alias: {
			$i18n: "./.svelte-kit/types/$i18n",
		},
	},
};

export default config;
