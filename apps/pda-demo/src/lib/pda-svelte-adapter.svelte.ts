/**
 * PDA Svelte GUI Adapter (Svelte 5 Runes only)
 *
 * Uses $state for reactive state management.
 */

import type {
  Adapter,
  InteractionRequest,
  InteractionResponse,
  ExecutionResult,
  OrchestratorState,
} from '@shelchin/pda';

// Union of all possible interaction response values
type ResponseValue = boolean | string | string[] | Record<string, unknown> | void;

// ============================================================================
// Types
// ============================================================================

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warning' | 'error';
  message: string;
}

export interface ProgressData {
  current: number;
  total?: number;
  status?: string;
}

export interface PendingInteraction {
  request: InteractionRequest;
  resolve: (response: InteractionResponse) => void;
}

// ============================================================================
// Svelte 5 Runes Adapter
// ============================================================================

export function createPDAAdapter() {
  // Reactive state using $state
  let orchestratorState = $state<OrchestratorState>('IDLE');
  let logs = $state<LogEntry[]>([]);
  let progress = $state<ProgressData | null>(null);
  let pendingInteraction = $state<PendingInteraction | null>(null);
  let result = $state<ExecutionResult<unknown> | null>(null);

  // Adapter implementation
  const adapter: Adapter = {
    onStateChange(from: OrchestratorState, to: OrchestratorState) {
      orchestratorState = to;
    },

    async collectInput(): Promise<Record<string, unknown>> {
      throw new Error('collectInput should not be called in GUI adapter - use form input');
    },

    async handleInteraction(request: InteractionRequest): Promise<InteractionResponse> {
      // Handle non-blocking interactions (progress/info) immediately
      if (request.type === 'progress') {
        const data = request.data as { current: number; total?: number; status?: string };
        progress = { current: data.current, total: data.total, status: data.status };
        return { requestId: request.requestId, value: undefined };
      }

      if (request.type === 'info') {
        const data = request.data as { level?: 'info' | 'warning' | 'error' } | undefined;
        logs = [...logs, {
          timestamp: Date.now(),
          level: data?.level ?? 'info',
          message: request.message,
        }];
        return { requestId: request.requestId, value: undefined };
      }

      // Blocking interactions - wait for user response
      return new Promise((resolve) => {
        pendingInteraction = { request, resolve };
      });
    },

    async renderOutput(res: ExecutionResult<unknown>) {
      result = res;
      pendingInteraction = null;
    },
  };

  // Respond to pending interaction
  function respond(value: ResponseValue) {
    if (pendingInteraction) {
      const { request, resolve } = pendingInteraction;
      resolve({ requestId: request.requestId, value });
      pendingInteraction = null;
    }
  }

  // Reset state
  function resetState() {
    orchestratorState = 'IDLE';
    logs = [];
    progress = null;
    pendingInteraction = null;
    result = null;
  }

  return {
    adapter,
    // Getters for reactive state (these will be reactive when accessed)
    get state() { return orchestratorState; },
    get logs() { return logs; },
    get progress() { return progress; },
    get pendingInteraction() { return pendingInteraction; },
    get result() { return result; },
    respond,
    reset: resetState,
  };
}
