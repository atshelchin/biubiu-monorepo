import { redirect } from '@sveltejs/kit';

// `capsule` was renamed to `seal` (the time-capsule feature was removed; it is now
// permanent private notes). Permanently redirect the old URL to the new one.
export const load = () => {
	redirect(308, '/apps/seal');
};
