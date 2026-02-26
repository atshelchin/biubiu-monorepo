import { createTaskHub, computeMerkleRoot, generateJobId } from '@shelchin/taskhub';
import { createBalanceRadarApp } from '../index.js';

const balanceRadarApp = createBalanceRadarApp({ createTaskHub, computeMerkleRoot, generateJobId });

// --- Task types ---
interface TaskProgress {
	current: number;
	total?: number;
	status?: string;
}

interface TaskResult {
	success: boolean;
	data?: unknown;
	error?: string;
}

export interface TaskEntry {
	id: string;
	state: 'pending' | 'running' | 'completed' | 'failed';
	progress?: TaskProgress;
	result?: TaskResult;
	createdAt: number;
	error?: string;
}

// --- Task store ---
const tasks = new Map<string, TaskEntry>();
const TTL = 10 * 60 * 1000; // 10 minutes

setInterval(() => {
	const now = Date.now();
	for (const [id, task] of tasks) {
		if (now - task.createdAt > TTL) tasks.delete(id);
	}
}, 60_000);

function createTask(): TaskEntry {
	const id = crypto.randomUUID();
	const entry: TaskEntry = { id, state: 'pending', createdAt: Date.now() };
	tasks.set(id, entry);
	return entry;
}

function updateTask(id: string, update: Partial<Omit<TaskEntry, 'id' | 'createdAt'>>): void {
	const task = tasks.get(id);
	if (task) Object.assign(task, update);
}

function getRunningTaskCount(): number {
	let count = 0;
	for (const task of tasks.values()) {
		if (task.state === 'running') count++;
	}
	return count;
}

export function getTask(id: string): TaskEntry | undefined {
	return tasks.get(id);
}

// --- Rate limiting ---
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 5;
const MAX_ADDRESSES = 20;
const MAX_CONCURRENT = 10;

const ipTimestamps = new Map<string, number[]>();

setInterval(() => {
	const now = Date.now();
	for (const [ip, timestamps] of ipTimestamps) {
		const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);
		if (recent.length === 0) {
			ipTimestamps.delete(ip);
		} else {
			ipTimestamps.set(ip, recent);
		}
	}
}, 5 * 60_000);

function checkRateLimit(ip: string): boolean {
	const now = Date.now();
	const timestamps = ipTimestamps.get(ip) ?? [];
	const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);

	if (recent.length >= RATE_LIMIT_MAX) {
		ipTimestamps.set(ip, recent);
		return false;
	}

	recent.push(now);
	ipTimestamps.set(ip, recent);
	return true;
}

// --- Public API ---

export type SubmitResult =
	| { ok: true; taskId: string }
	| { ok: false; error: string; status: number };

export async function submitTask(body: unknown, ip: string): Promise<SubmitResult> {
	if (!checkRateLimit(ip)) {
		return { ok: false, error: 'Rate limit exceeded. Max 5 requests per minute.', status: 429 };
	}

	if (getRunningTaskCount() >= MAX_CONCURRENT) {
		return {
			ok: false,
			error: 'Server busy. Too many concurrent tasks. Try again later.',
			status: 503,
		};
	}

	const parsed = balanceRadarApp.manifest.inputSchema.safeParse(body);
	if (!parsed.success) {
		return { ok: false, error: JSON.stringify(parsed.error.flatten()), status: 400 };
	}

	const addressCount = parsed.data.addresses
		.split(/[,\n]/)
		.filter((a: string) => a.trim()).length;
	if (addressCount > MAX_ADDRESSES) {
		return {
			ok: false,
			error: `Too many addresses. Max ${MAX_ADDRESSES}, got ${addressCount}.`,
			status: 400,
		};
	}

	const task = createTask();
	updateTask(task.id, { state: 'running' });

	balanceRadarApp
		.runHttp(parsed.data, {
			onProgress: (current: number, total?: number, status?: string) => {
				updateTask(task.id, { progress: { current, total, status } });
			},
		})
		.then((result) => {
			updateTask(task.id, {
				state: result.success ? 'completed' : 'failed',
				result,
			});
		})
		.catch((error: Error) => {
			updateTask(task.id, { state: 'failed', error: error.message });
		});

	return { ok: true, taskId: task.id };
}
