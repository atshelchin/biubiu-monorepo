import type { MCPAdapter, MCPToolDefinition, MCPToolResult } from './types.js';
import type {
  Manifest,
  InteractionRequest,
  InteractionResponse,
  ExecutionResult,
  OrchestratorState,
  InteractionType,
} from '../types.js';
import { zodToJsonSchema, getSchemaFields } from '../manifest/schema.js';

/**
 * MCP Adapter - for AI Agent integration
 *
 * Converts manifest to MCP tool definition and handles tool calls.
 * Interactions are queued and resolved via separate method calls.
 *
 * @example
 * ```typescript
 * const adapter = new MCPAdapterImpl(manifest);
 *
 * // Get tool definition for MCP server registration
 * const toolDef = adapter.getToolDefinition();
 *
 * // Handle incoming tool call
 * await adapter.handleToolCall(params);
 *
 * // Run orchestrator
 * const result = await orchestrator.run();
 *
 * // Convert to MCP result format
 * return adapter.toMCPResult(result);
 * ```
 */
export class MCPAdapterImpl<TInput = unknown, TOutput = unknown>
  implements MCPAdapter<TInput, TOutput>
{
  private pendingInput: TInput | null = null;
  private pendingInteractions = new Map<
    string,
    (response: InteractionResponse) => void
  >();
  private interactionQueue: Array<{
    request: InteractionRequest;
    resolve: (response: InteractionResponse) => void;
  }> = [];

  constructor(private manifest: Manifest) {}

  getToolDefinition(): MCPToolDefinition {
    const jsonSchema = zodToJsonSchema(this.manifest.inputSchema);

    return {
      name: this.manifest.id,
      description: this.manifest.description ?? this.manifest.name,
      inputSchema: jsonSchema as MCPToolDefinition['inputSchema'],
    };
  }

  async handleToolCall(params: unknown): Promise<MCPToolResult> {
    this.pendingInput = params as TInput;

    return {
      content: [
        {
          type: 'text',
          text: `Ready to execute ${this.manifest.name}. Input received and validated.`,
        },
      ],
    };
  }

  async collectInput(manifest: Manifest): Promise<TInput> {
    if (this.pendingInput) {
      const input = this.pendingInput;
      this.pendingInput = null;
      return input;
    }
    throw new Error('No input provided. Call handleToolCall first.');
  }

  async handleInteraction<T extends InteractionType>(
    request: InteractionRequest<T>
  ): Promise<InteractionResponse<T>> {
    if (!request.requiresResponse) {
      // For progress/info, we could log or emit events
      return { requestId: request.requestId, value: undefined as never };
    }

    // Queue the interaction for external resolution
    return new Promise((resolve) => {
      this.interactionQueue.push({
        request,
        resolve: resolve as (response: InteractionResponse) => void,
      });
      this.pendingInteractions.set(
        request.requestId,
        resolve as (response: InteractionResponse) => void
      );
    });
  }

  /**
   * Get pending interactions that need responses
   */
  getPendingInteractions(): InteractionRequest[] {
    return this.interactionQueue.map((item) => item.request);
  }

  /**
   * Check if there are pending interactions
   */
  hasPendingInteractions(): boolean {
    return this.interactionQueue.length > 0;
  }

  /**
   * Respond to a pending interaction
   */
  respondToInteraction(requestId: string, value: unknown): boolean {
    const resolver = this.pendingInteractions.get(requestId);
    if (resolver) {
      resolver({ requestId, value: value as never });
      this.pendingInteractions.delete(requestId);
      this.interactionQueue = this.interactionQueue.filter(
        (item) => item.request.requestId !== requestId
      );
      return true;
    }
    return false;
  }

  /**
   * Respond to the next pending interaction
   */
  respondToNext(value: unknown): boolean {
    const next = this.interactionQueue[0];
    if (next) {
      return this.respondToInteraction(next.request.requestId, value);
    }
    return false;
  }

  async renderOutput(
    result: ExecutionResult<TOutput>,
    manifest: Manifest
  ): Promise<void> {
    // MCP adapter doesn't render - the result is returned via toMCPResult
  }

  onStateChange(from: OrchestratorState, to: OrchestratorState): void {
    // Could emit events for debugging
  }

  /**
   * Convert execution result to MCP tool result format
   */
  toMCPResult(result: ExecutionResult<TOutput>): MCPToolResult {
    if (!result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${result.error}`,
          },
        ],
        isError: true,
      };
    }

    const content: MCPToolResult['content'] = [];

    // Add main output
    content.push({
      type: 'text',
      text:
        typeof result.data === 'string'
          ? result.data
          : JSON.stringify(result.data, null, 2),
    });

    // Add file references
    if (result.files) {
      for (const file of result.files) {
        content.push({
          type: 'resource',
          text: `File: ${file.filename ?? file.handle} (${file.mimeType}, ${file.size} bytes)`,
        });
      }
    }

    return { content };
  }

  /**
   * Format interaction as MCP prompt for AI
   */
  formatInteractionForAI(request: InteractionRequest): string {
    switch (request.type) {
      case 'confirm':
        return `[CONFIRMATION REQUIRED]\n${request.message}\nRespond with "yes" or "no"`;

      case 'prompt':
        return `[INPUT REQUIRED]\n${request.message}\nProvide your response as text`;

      case 'select': {
        const data = request.data as { options: { value: string; label: string }[] };
        const options = data.options.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
        return `[SELECTION REQUIRED]\n${request.message}\n${options}\nRespond with the number of your choice`;
      }

      case 'multiselect': {
        const data = request.data as { options: { value: string; label: string }[] };
        const options = data.options.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
        return `[MULTI-SELECTION REQUIRED]\n${request.message}\n${options}\nRespond with comma-separated numbers`;
      }

      default:
        return `[INTERACTION REQUIRED]\n${request.message}`;
    }
  }

  /**
   * Parse AI response for interaction
   */
  parseAIResponse(request: InteractionRequest, aiResponse: string): unknown {
    const response = aiResponse.trim().toLowerCase();

    switch (request.type) {
      case 'confirm':
        return (
          response === 'yes' ||
          response === 'y' ||
          response === 'true' ||
          response === '1'
        );

      case 'prompt':
        return aiResponse.trim();

      case 'select': {
        const data = request.data as { options: { value: string; label: string }[] };
        const index = parseInt(response) - 1;
        if (index >= 0 && index < data.options.length) {
          return data.options[index].value;
        }
        // Try to match by label
        const match = data.options.find(
          (o) => o.label.toLowerCase() === response || o.value.toLowerCase() === response
        );
        return match?.value ?? data.options[0]?.value;
      }

      case 'multiselect': {
        const data = request.data as { options: { value: string; label: string }[] };
        const indices = response.split(',').map((s) => parseInt(s.trim()) - 1);
        return indices
          .filter((i) => i >= 0 && i < data.options.length)
          .map((i) => data.options[i].value);
      }

      default:
        return aiResponse.trim();
    }
  }
}
