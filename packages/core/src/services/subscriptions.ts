import { count, eq } from 'drizzle-orm';
import type { SubscriptionDto } from '@lest/contracts';
import type { Db } from '@lest/db';
import { domains, subscriptions } from '@lest/db';
import type { Actor } from '../rbac';

export class SubscriptionService {
  constructor(private readonly db: Db) {}

  async list(actor: Actor): Promise<SubscriptionDto[]> {
    const base = this.db.select().from(subscriptions);
    const rows =
      actor.role === 'customer' && actor.customerId
        ? await base.where(eq(subscriptions.customerId, actor.customerId))
        : await base;

    const out: SubscriptionDto[] = [];
    for (const s of rows) {
      const c = await this.db
        .select({ value: count() })
        .from(domains)
        .where(eq(domains.subscriptionId, s.id));
      out.push({
        id: s.id,
        customerId: s.customerId,
        planId: s.planId,
        state: s.state,
        effectiveLimits: s.effectiveLimits as unknown as Record<string, unknown>,
        domainCount: c[0]?.value ?? 0,
      });
    }
    return out;
  }
}
