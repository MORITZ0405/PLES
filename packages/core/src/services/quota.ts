import { count, eq } from 'drizzle-orm';
import type { Db, Subscription } from '@lest/db';
import { databases, domains, UNLIMITED } from '@lest/db';
import { QuotaExceededError } from '../errors';

/** Enforces a subscription's frozen `effectiveLimits` against current usage. */
export class QuotaService {
  constructor(private readonly db: Db) {}

  async assertCanAddDomain(sub: Subscription): Promise<void> {
    const limit = sub.effectiveLimits.maxDomains;
    if (limit === UNLIMITED) return;
    const rows = await this.db
      .select({ value: count() })
      .from(domains)
      .where(eq(domains.subscriptionId, sub.id));
    if ((rows[0]?.value ?? 0) >= limit) throw new QuotaExceededError('maxDomains', limit);
  }

  async assertCanAddDatabase(sub: Subscription): Promise<void> {
    const limit = sub.effectiveLimits.maxDbs;
    if (limit === UNLIMITED) return;
    const rows = await this.db
      .select({ value: count() })
      .from(databases)
      .where(eq(databases.subscriptionId, sub.id));
    if ((rows[0]?.value ?? 0) >= limit) throw new QuotaExceededError('maxDbs', limit);
  }
}
