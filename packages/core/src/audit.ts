import type { Db } from '@lest/db';
import { auditEvents } from '@lest/db';
import { newId } from './ids';

export interface AuditInput {
  actorUserId?: string | null;
  actorIp?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  requestId?: string;
  outcome: 'ok' | 'denied' | 'error';
  detail?: Record<string, unknown>;
}

/** Append-only audit write. (In prod the `lest` DB role is denied UPDATE/DELETE here.) */
export async function writeAudit(db: Db, input: AuditInput): Promise<void> {
  await db.insert(auditEvents).values({
    id: newId(),
    actorUserId: input.actorUserId ?? null,
    actorIp: input.actorIp ?? null,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    requestId: input.requestId ?? null,
    outcome: input.outcome,
    detailJson: input.detail ?? null,
  });
}
