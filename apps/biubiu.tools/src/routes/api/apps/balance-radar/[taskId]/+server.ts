import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTask } from '$lib/pda-apps/balance-radar/adapters/http';

export const GET: RequestHandler = async ({ params }) => {
	const task = getTask(params.taskId);

	if (!task) {
		return json({ error: 'Task not found or expired' }, { status: 404 });
	}

	if (task.state === 'completed' || task.state === 'failed') {
		return json({
			state: task.state,
			result: task.result,
			...(task.error ? { error: task.error } : {}),
		});
	}

	return json({
		state: task.state,
		progress: task.progress,
	});
};
