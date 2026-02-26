import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { submitTask } from '$lib/pda-apps/balance-radar/adapters/http';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const result = await submitTask(body, getClientAddress());

	if (!result.ok) {
		return json({ error: result.error }, { status: result.status });
	}

	return json({ taskId: result.taskId }, { status: 202 });
};
