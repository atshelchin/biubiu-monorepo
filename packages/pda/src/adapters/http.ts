import type { Adapter } from './types.js';
import type {
	Manifest,
	InteractionRequest,
	InteractionResponse,
	ExecutionResult,
	OrchestratorState,
	InteractionType,
} from '../types.js';

export interface HttpAdapterOptions {
	onProgress?: (current: number, total?: number, status?: string) => void;
}

/**
 * HTTP Adapter - non-interactive, designed for HTTP API endpoints.
 *
 * - Input is pre-collected from request body
 * - Interactions are auto-answered with defaults (like CLI non-interactive mode)
 * - Progress updates are forwarded via callback
 * - Output rendering is a no-op (handled by the route handler)
 */
export class HttpAdapterImpl<TInput = unknown, TOutput = unknown>
	implements Adapter<TInput, TOutput>
{
	private input: TInput;
	private progressCallback?: HttpAdapterOptions['onProgress'];

	constructor(input: TInput, options?: HttpAdapterOptions) {
		this.input = input;
		this.progressCallback = options?.onProgress;
	}

	async collectInput(): Promise<TInput> {
		return this.input;
	}

	async handleInteraction<T extends InteractionType>(
		request: InteractionRequest<T>
	): Promise<InteractionResponse<T>> {
		if (!request.requiresResponse) {
			if (request.type === 'progress' && this.progressCallback) {
				const data = request.data as { current: number; total?: number; status?: string };
				this.progressCallback(data.current, data.total, data.status);
			}
			return { requestId: request.requestId, value: undefined as never };
		}

		// Auto-answer with defaults
		return {
			requestId: request.requestId,
			value: request.defaultValue as never,
			skipped: true,
		};
	}

	async renderOutput(): Promise<void> {
		// No-op: HTTP response is handled by the route handler
	}

	onStateChange(_from: OrchestratorState, _to: OrchestratorState): void {
		// No-op
	}
}
