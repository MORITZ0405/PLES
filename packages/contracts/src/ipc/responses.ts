/** Typed error codes the daemon may return. No free-form strings cross the wire. */
export type AgentErrorCode =
  | 'UNAUTHORIZED'
  | 'OWNERSHIP_MISMATCH'
  | 'VALIDATION'
  | 'RATE_LIMITED'
  | 'CONCURRENCY_LIMITED'
  | 'DEADLINE_EXCEEDED'
  | 'CONFLICT'
  | 'SYSTEM_FAILURE';

export interface AgentError {
  code: AgentErrorCode;
  /** Optional human-readable detail. Never contains secrets. */
  detail?: string;
  /** Whether the caller may retry the same idempotency key. */
  retriable?: boolean;
}

export type AgentResponse<T = unknown> =
  | { id: string; ok: true; result: T }
  | { id: string; ok: false; error: AgentError };

export class AgentCommandError extends Error {
  constructor(public readonly agentError: AgentError) {
    super(`agent error: ${agentError.code}${agentError.detail ? ` (${agentError.detail})` : ''}`);
    this.name = 'AgentCommandError';
  }
}
