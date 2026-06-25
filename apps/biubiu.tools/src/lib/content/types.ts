import type { Component } from 'svelte';

export interface BlogMeta {
	title: string;
	description: string;
	date: string; // ISO date, e.g. "2026-06-25"
	author?: string;
	tags?: string[];
	cover?: string; // Optional cover image path (absolute, e.g. "/og/post.png")
	draft?: boolean; // Set true to hide from list / RSS / sitemap
}

export interface DocMeta {
	title: string;
	description?: string;
}

/** Shape of a `.md` module compiled by mdsvex. */
export interface MarkdownModule<M> {
	default: Component;
	metadata: M;
}
