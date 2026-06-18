import { Command, type AgentResponse } from '@lest/contracts';
import type { AgentClient, ProviderCtx } from '@lest/core';

/**
 * The in-process stand-in for `lest-agentd` used in dev/tests. It exercises the SAME
 * `contracts` command schema the real daemon validates, so a command that passes here
 * is wire-compatible with the Linux daemon. (M2 extends this to dispatch to mock
 * handlers and simulate rejection paths — see DESIGN.md.)
 */
export class InProcessAgent implements AgentClient {
  async send<T = unknown>(
    ctx: ProviderCtx,
    command: Command,
    _idempotencyKey: string,
  ): Promise<AgentResponse<T>> {
    const parsed = Command.safeParse(command);
    if (!parsed.success) {
      return { id: ctx.requestId, ok: false, error: { code: 'VALIDATION', detail: parsed.error.message } };
    }
    return { id: ctx.requestId, ok: true, result: {} as T };
  }

  async ping(): Promise<{ ok: true; version: string }> {
    return { ok: true, version: 'mock-inprocess' };
  }
}
