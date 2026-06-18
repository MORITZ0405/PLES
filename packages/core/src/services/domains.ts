import { eq } from 'drizzle-orm';
import type { CreateDomainRequest, DomainDto } from '@lest/contracts';
import type { Db, Domain, Subscription } from '@lest/db';
import { domains, reconcileIntents, subscriptions, systemUsers } from '@lest/db';
import { writeAudit } from '../audit';
import { ConflictError, NotFoundError } from '../errors';
import { deriveDocRoot, newId, newIdempotencyKey } from '../ids';
import type { Providers, ProviderCtx } from '../providers';
import { assertSubscriptionAccess, type Actor } from '../rbac';
import { QuotaService } from './quota';

export interface RequestMeta {
  ip?: string | null;
}

export class DomainService {
  private readonly quota: QuotaService;

  constructor(
    private readonly db: Db,
    private readonly providers: Providers,
  ) {
    this.quota = new QuotaService(db);
  }

  async list(actor: Actor, subscriptionId: string): Promise<DomainDto[]> {
    const sub = await this.loadSubscription(subscriptionId);
    assertSubscriptionAccess(actor, sub);
    const rows = await this.db
      .select()
      .from(domains)
      .where(eq(domains.subscriptionId, subscriptionId));
    return rows.map(toDto);
  }

  async create(
    actor: Actor,
    subscriptionId: string,
    input: CreateDomainRequest,
    meta: RequestMeta = {},
  ): Promise<DomainDto> {
    const sub = await this.loadSubscription(subscriptionId);
    assertSubscriptionAccess(actor, sub);
    await this.quota.assertCanAddDomain(sub);

    const dupes = await this.db
      .select({ id: domains.id })
      .from(domains)
      .where(eq(domains.fqdn, input.fqdn))
      .limit(1);
    if (dupes.length > 0) throw new ConflictError(`domain ${input.fqdn} already exists`);

    const sysUser = await this.loadSystemUser(subscriptionId);
    const docRoot = deriveDocRoot(sysUser.homeDir, input.fqdn);
    const domainId = newId();

    await this.db.insert(domains).values({
      id: domainId,
      subscriptionId,
      fqdn: input.fqdn,
      type: input.type,
      docRoot,
      phpVersion: input.phpVersion,
      vhostState: 'pending',
      httpsMode: input.httpsMode,
    });

    const idempotencyKey = newIdempotencyKey();
    await this.db.insert(reconcileIntents).values({
      id: newId(),
      serverId: sub.serverId,
      subscriptionId,
      kind: 'webserver.upsertVhost',
      targetType: 'domain',
      targetId: domainId,
      desiredState: {
        fqdn: input.fqdn,
        docRoot,
        phpVersion: input.phpVersion,
        httpsMode: input.httpsMode,
      },
      status: 'pending',
      idempotencyKey,
    });

    const ctx: ProviderCtx = {
      requestId: newId(),
      actorUserId: actor.userId,
      subscriptionId,
      serverId: sub.serverId,
    };

    try {
      await this.providers.webServer.upsertVhost(ctx, {
        domainId,
        fqdn: input.fqdn,
        aliases: [],
        docRoot,
        phpVersion: input.phpVersion,
        httpsMode: input.httpsMode,
      });
      await this.db.update(domains).set({ vhostState: 'live' }).where(eq(domains.id, domainId));
      await this.db
        .update(reconcileIntents)
        .set({ status: 'applied' })
        .where(eq(reconcileIntents.idempotencyKey, idempotencyKey));
      await writeAudit(this.db, {
        actorUserId: actor.userId,
        actorIp: meta.ip,
        action: 'domain.create',
        targetType: 'domain',
        targetId: domainId,
        requestId: ctx.requestId,
        outcome: 'ok',
      });
    } catch (err) {
      await this.db
        .update(reconcileIntents)
        .set({ status: 'failed', lastError: String(err) })
        .where(eq(reconcileIntents.idempotencyKey, idempotencyKey));
      await writeAudit(this.db, {
        actorUserId: actor.userId,
        actorIp: meta.ip,
        action: 'domain.create',
        targetType: 'domain',
        targetId: domainId,
        requestId: ctx.requestId,
        outcome: 'error',
        detail: { error: String(err) },
      });
      throw err;
    }

    const [row] = await this.db.select().from(domains).where(eq(domains.id, domainId)).limit(1);
    return toDto(row!);
  }

  private async loadSubscription(id: string): Promise<Subscription> {
    const [sub] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, id))
      .limit(1);
    if (!sub) throw new NotFoundError('subscription');
    return sub;
  }

  private async loadSystemUser(subscriptionId: string) {
    const [su] = await this.db
      .select()
      .from(systemUsers)
      .where(eq(systemUsers.subscriptionId, subscriptionId))
      .limit(1);
    if (!su) throw new NotFoundError('system user');
    return su;
  }
}

function toDto(d: Domain): DomainDto {
  return {
    id: d.id,
    subscriptionId: d.subscriptionId,
    fqdn: d.fqdn,
    type: d.type,
    docRoot: d.docRoot,
    phpVersion: d.phpVersion,
    vhostState: d.vhostState,
    httpsMode: d.httpsMode,
    createdAt: d.createdAt.toISOString(),
  };
}
