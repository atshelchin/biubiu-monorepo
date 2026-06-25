import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { readable } from 'svelte/store';
import { render } from 'vitest-browser-svelte';

// The homepage renders <SEO> which subscribes to `page` from $app/stores
// ($page.url.pathname). Outside a router there is no page store, so provide a
// minimal readable one — otherwise SEO.svelte throws on $page.url.pathname.
vi.mock('$app/stores', () => ({
	page: readable({
		url: new URL('http://localhost/'),
		params: {},
		route: { id: '/' },
		status: 200,
		error: null,
		data: {},
		form: null
	})
}));

import Page from './+page.svelte';

describe('/+page.svelte', () => {
	it('should render h1', async () => {
		render(Page);

		const heading = page.getByRole('heading', { level: 1 });
		await expect.element(heading).toBeInTheDocument();
	});
});
