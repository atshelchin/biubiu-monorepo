/**
 * Type-safe route helpers for btc-updown-5m app.
 * All navigation uses these instead of magic strings.
 */
import { localizeHref } from '$lib/i18n';

const BASE = '/apps/btc-updown-5m';

export const routes = {
	hub: () => localizeHref(BASE),
	space: (spaceId: string) => localizeHref(`${BASE}/space/${spaceId}`),
	instance: (spaceId: string, instanceId: string) => localizeHref(`${BASE}/space/${spaceId}/instance/${instanceId}`),
	strategy: (spaceId: string, strategyId: string) => localizeHref(`${BASE}/space/${spaceId}/strategy/${strategyId}`),
	member: (spaceId: string, userId: string) => localizeHref(`${BASE}/space/${spaceId}/member/${userId}`),
	marketplace: () => localizeHref(`${BASE}/marketplace`),
	editor: () => localizeHref(`${BASE}/editor`),
};
