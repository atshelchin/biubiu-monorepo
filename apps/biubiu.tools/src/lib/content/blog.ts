import type { Component } from 'svelte';
import type { BlogMeta, MarkdownModule } from './types';

// All blog posts are compiled at build time (mdsvex → Svelte components) and
// eagerly imported, so there is zero runtime markdown parsing. The raw sources
// are imported separately, only to estimate reading time.
const modules = import.meta.glob<MarkdownModule<BlogMeta>>('/src/content/blog/*.md', {
	eager: true
});

const sources = import.meta.glob<string>('/src/content/blog/*.md', {
	eager: true,
	query: '?raw',
	import: 'default'
});

export interface BlogPost {
	slug: string;
	meta: BlogMeta;
	component: Component;
	readingMinutes: number;
}

function slugFromPath(path: string): string {
	return path.split('/').pop()!.replace(/\.md$/, '');
}

function estimateReadingMinutes(raw: string): number {
	const body = raw.replace(/^---[\s\S]*?---/, '');
	const words = body.trim().split(/\s+/).filter(Boolean).length;
	return Math.max(1, Math.round(words / 200));
}

function toIsoDate(value: string): string {
	return String(value).slice(0, 10);
}

const allPosts: BlogPost[] = Object.entries(modules)
	.filter(([path, mod]) => {
		if (!mod.metadata?.title || !mod.metadata?.date) {
			console.warn(`[blog] Skipping ${path}: missing title/date frontmatter`);
			return false;
		}
		return true;
	})
	.map(([path, mod]) => ({
		slug: slugFromPath(path),
		meta: { ...mod.metadata, date: toIsoDate(mod.metadata.date) },
		component: mod.default,
		readingMinutes: estimateReadingMinutes(sources[path] ?? '')
	}));

const publishedPosts = allPosts
	.filter((p) => !p.meta.draft)
	.sort((a, b) => (a.meta.date < b.meta.date ? 1 : -1));

export function getAllPosts(): BlogPost[] {
	return publishedPosts;
}

export function getPost(slug: string): BlogPost | undefined {
	return allPosts.find((p) => p.slug === slug);
}

export function getAllPostSlugs(): string[] {
	return publishedPosts.map((p) => p.slug);
}

export function getAdjacentPosts(slug: string): { newer?: BlogPost; older?: BlogPost } {
	const index = publishedPosts.findIndex((p) => p.slug === slug);
	if (index === -1) return {};
	return { newer: publishedPosts[index - 1], older: publishedPosts[index + 1] };
}
