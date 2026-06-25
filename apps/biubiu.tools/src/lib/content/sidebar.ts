/**
 * Single source of truth for the docs structure: it drives the sidebar order,
 * the doc URLs, and the prev/next pager. Item titles mirror the English `.md`
 * frontmatter (article bodies are English-only); the surrounding chrome is
 * translated via the `docs` i18n namespace.
 */

export interface SidebarItem {
	slug: string;
	title: string;
}

export interface SidebarGroup {
	title: string;
	items: SidebarItem[];
}

export const sidebar: SidebarGroup[] = [
	{
		title: 'Getting Started',
		items: [
			{ slug: 'introduction', title: 'Introduction' },
			{ slug: 'getting-started', title: 'Getting started' },
			{ slug: 'wallets-and-accounts', title: 'Wallets & accounts' }
		]
	},
	{
		title: 'Tools',
		items: [
			{ slug: 'revoke-approvals', title: 'Revoke Approvals' },
			{ slug: 'balance-radar', title: 'Balance Radar' },
			{ slug: 'token-sender', title: 'Token Sender' },
			{ slug: 'chain-explorer', title: 'Chain Explorer' }
		]
	},
	{
		title: 'Resources',
		items: [
			{ slug: 'membership', title: 'Pro membership' },
			{ slug: 'privacy-and-security', title: 'Privacy & security' },
			{ slug: 'faq', title: 'FAQ' }
		]
	}
];

export const flatSidebar: SidebarItem[] = sidebar.flatMap((group) => group.items);

/** The doc shown at the bare `/docs` route. */
export const DOCS_INDEX_SLUG = 'introduction';

/** Locale-agnostic doc path (callers wrap it with `localizeHref`). */
export function docHref(slug: string): string {
	return slug === DOCS_INDEX_SLUG ? '/docs' : `/docs/${slug}`;
}
