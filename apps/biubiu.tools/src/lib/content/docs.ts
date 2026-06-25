import type { Component } from 'svelte';
import type { DocMeta, MarkdownModule } from './types';
import { flatSidebar, DOCS_INDEX_SLUG, type SidebarItem } from './sidebar';

// GitHub repo coordinates for the "Edit this page" link.
const REPO = 'https://github.com/atshelchin/biubiu-monorepo';
const REPO_BRANCH = 'main';
const DOCS_CONTENT_DIR = 'apps/biubiu.tools/src/content/docs';

const modules = import.meta.glob<MarkdownModule<DocMeta>>('/src/content/docs/*.md', {
	eager: true
});

function slugFromPath(path: string): string {
	return path.split('/').pop()!.replace(/\.md$/, '');
}

const bySlug = new Map<string, MarkdownModule<DocMeta>>();
for (const [path, mod] of Object.entries(modules)) {
	bySlug.set(slugFromPath(path), mod);
}

export interface DocEntry {
	slug: string;
	meta: DocMeta;
	component: Component;
}

export function getDoc(slug: string): DocEntry | undefined {
	const mod = bySlug.get(slug);
	if (!mod) return undefined;
	return { slug, meta: mod.metadata, component: mod.default };
}

export function getAdjacentDocs(slug: string): { prev?: SidebarItem; next?: SidebarItem } {
	const index = flatSidebar.findIndex((item) => item.slug === slug);
	if (index === -1) return {};
	return { prev: flatSidebar[index - 1], next: flatSidebar[index + 1] };
}

/** All doc slugs except the index (which is served at the bare `/docs`). */
export function getDocSlugs(): string[] {
	return flatSidebar.map((item) => item.slug).filter((slug) => slug !== DOCS_INDEX_SLUG);
}

export function getDocEditUrl(slug: string): string {
	return `${REPO}/edit/${REPO_BRANCH}/${DOCS_CONTENT_DIR}/${slug}.md`;
}
