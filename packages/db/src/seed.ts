import { randomUUID } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { loadConfig } from '@lest/config';
import { createDb } from './client';
import { customers, plans, servers, subscriptions, systemUsers, users } from './schema';
import { DEFAULT_LIMITS } from './types';

const ADMIN_EMAIL = process.env.LEST_ADMIN_EMAIL ?? 'admin@lest.local';
const ADMIN_PASSWORD = process.env.LEST_ADMIN_PASSWORD ?? 'change-me-admin-0000';

/** Short hex tag derived from a uuid, used for namespaced unix/db identifiers. */
function tag(uuid: string): string {
  return uuid.replace(/-/g, '').slice(0, 8);
}

async function main() {
  const cfg = loadConfig();
  const { db, close } = await createDb(cfg);

  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) {
    // eslint-disable-next-line no-console
    console.log('[lest:db] seed skipped — data already present');
    await close();
    return;
  }

  const serverId = 'local';
  await db.insert(servers).values({
    id: serverId,
    hostname: 'localhost',
    agentEndpoint: cfg.mode === 'agent' ? `unix://${cfg.agent.socketPath}` : 'inproc://mock',
    status: 'online',
    capabilities: { phpVersions: ['8.1', '8.2', '8.3'], hasMysql: true, hasPostgres: true },
  });

  const planId = randomUUID();
  await db.insert(plans).values({
    id: planId,
    ownerScope: 'platform',
    name: 'Default',
    status: 'active',
    limits: DEFAULT_LIMITS,
  });

  const adminId = randomUUID();
  await db.insert(users).values({
    id: adminId,
    email: ADMIN_EMAIL.toLowerCase(),
    passwordHash: await hash(ADMIN_PASSWORD),
    role: 'admin',
    customerId: null,
    status: 'active',
  });

  // A demo customer + subscription so domains can be created immediately in dev.
  const customerId = randomUUID();
  await db.insert(customers).values({ id: customerId, name: 'Demo GmbH', status: 'active' });

  const subId = randomUUID();
  await db.insert(subscriptions).values({
    id: subId,
    customerId,
    planId,
    serverId,
    state: 'active',
    effectiveLimits: DEFAULT_LIMITS,
  });

  const unixUsername = `lest_${tag(subId)}`;
  await db.insert(systemUsers).values({
    id: randomUUID(),
    subscriptionId: subId,
    serverId,
    unixUsername,
    homeDir: `/var/www/${unixUsername}`,
    state: 'pending',
  });

  await close();

  // eslint-disable-next-line no-console
  console.log('[lest:db] seed complete');
  // eslint-disable-next-line no-console
  console.log(`  admin login : ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  // eslint-disable-next-line no-console
  console.log(`  demo subscription id: ${subId}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[lest:db] seed failed:', err);
  process.exit(1);
});
