/**
 * Communication protocol types between main thread and worker
 */

// ============ Main Thread → Worker ============

export interface CallMessage {
  $type: 'CALL';
  $id: number;
  method: string;
  args: unknown[];
}

export interface CancelMessage {
  $type: 'CANCEL';
  $id: number;
}

export type MainToWorkerMessage = CallMessage | CancelMessage;

// ============ Worker → Main Thread ============

export interface ReadyMessage {
  $type: 'READY';
  methods: string[];
}

export interface ResolveMessage {
  $type: 'RESOLVE';
  $id: number;
  value: unknown;
}

export interface RejectMessage {
  $type: 'REJECT';
  $id: number;
  error: SerializedError;
}

export interface YieldMessage {
  $type: 'YIELD';
  $id: number;
  value: unknown;
}

export interface DoneMessage {
  $type: 'DONE';
  $id: number;
}

export type WorkerToMainMessage =
  | ReadyMessage
  | ResolveMessage
  | RejectMessage
  | YieldMessage
  | DoneMessage;

// ============ Error Serialization ============

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    name: 'Error',
    message: String(error),
  };
}
