import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { ResourceLimits } from './types';

// ── Enums ───────────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum('role', ['admin', 'reseller', 'customer']);
export const userStatusEnum = pgEnum('user_status', ['active', 'disabled']);
export const customerStatusEnum = pgEnum('customer_status', ['active', 'suspended']);
export const ownerScopeEnum = pgEnum('owner_scope', ['platform', 'reseller']);
export const planStatusEnum = pgEnum('plan_status', ['active', 'archived']);
export const subStateEnum = pgEnum('sub_state', ['active', 'suspended', 'terminated']);
export const serverStatusEnum = pgEnum('server_status', ['online', 'degraded', 'offline']);
export const resourceStateEnum = pgEnum('resource_state', [
  'pending',
  'provisioning',
  'active',
  'error',
  'removing',
]);
export const domainTypeEnum = pgEnum('domain_type', ['primary', 'addon', 'subdomain', 'alias']);
export const vhostStateEnum = pgEnum('vhost_state', ['pending', 'live', 'disabled']);
export const httpsModeEnum = pgEnum('https_mode', ['off', 'redirect', 'only']);
export const dbEngineEnum = pgEnum('db_engine', ['mysql', 'postgres']);
export const certStatusEnum = pgEnum('cert_status', ['pending', 'issued', 'renewing', 'failed']);
export const certProviderEnum = pgEnum('cert_provider', ['letsencrypt', 'custom']);
export const dnsTypeEnum = pgEnum('dns_type', ['A', 'CNAME', 'TXT']);
export const intentStatusEnum = pgEnum('intent_status', ['pending', 'applied', 'failed']);
export const auditOutcomeEnum = pgEnum('audit_outcome', ['ok', 'denied', 'error']);

const id = () => text('id').primaryKey();
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

// ── Identity & tenancy ────────────────────────────────────────────────────────────
export const customers = pgTable('customers', {
  id: id(),
  parentResellerId: text('parent_reseller_id'),
  name: text('name').notNull(),
  status: customerStatusEnum('status').notNull().default('active'),
  createdAt: createdAt(),
});

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    totpSecret: text('totp_secret'),
    role: roleEnum('role').notNull(),
    customerId: text('customer_id').references(() => customers.id),
    status: userStatusEnum('status').notNull().default('active'),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email)],
);

export const sessions = pgTable('sessions', {
  id: id(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  tokenHash: text('token_hash').notNull(),
  createdAt: createdAt(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export const plans = pgTable('plans', {
  id: id(),
  ownerScope: ownerScopeEnum('owner_scope').notNull().default('platform'),
  ownerResellerId: text('owner_reseller_id').references(() => customers.id),
  name: text('name').notNull(),
  status: planStatusEnum('status').notNull().default('active'),
  limits: jsonb('limits').$type<ResourceLimits>().notNull(),
  createdAt: createdAt(),
});

// ── Servers (one 'local' row in v1; multi-server ready) ─────────────────────────────
export const servers = pgTable('servers', {
  id: id(),
  hostname: text('hostname').notNull(),
  agentEndpoint: text('agent_endpoint').notNull(),
  publicIp: text('public_ip'),
  status: serverStatusEnum('status').notNull().default('online'),
  capabilities: jsonb('capabilities').$type<Record<string, unknown>>().notNull().default({}),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const subscriptions = pgTable('subscriptions', {
  id: id(),
  customerId: text('customer_id')
    .notNull()
    .references(() => customers.id),
  planId: text('plan_id')
    .notNull()
    .references(() => plans.id),
  serverId: text('server_id')
    .notNull()
    .references(() => servers.id),
  state: subStateEnum('state').notNull().default('active'),
  effectiveLimits: jsonb('effective_limits').$type<ResourceLimits>().notNull(),
  diskUsedMb: integer('disk_used_mb').notNull().default(0),
  createdAt: createdAt(),
});

// ── Host-facing resources ──────────────────────────────────────────────────────────
export const systemUsers = pgTable(
  'system_users',
  {
    id: id(),
    subscriptionId: text('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id),
    unixUsername: text('unix_username').notNull(),
    uid: integer('uid'),
    homeDir: text('home_dir').notNull(),
    shell: text('shell').notNull().default('/usr/sbin/nologin'),
    state: resourceStateEnum('state').notNull().default('pending'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('system_users_subscription_unique').on(t.subscriptionId),
    uniqueIndex('system_users_username_unique').on(t.unixUsername),
  ],
);

export const domains = pgTable(
  'domains',
  {
    id: id(),
    subscriptionId: text('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    fqdn: text('fqdn').notNull(),
    type: domainTypeEnum('type').notNull().default('primary'),
    docRoot: text('doc_root').notNull(),
    phpVersion: text('php_version'),
    vhostState: vhostStateEnum('vhost_state').notNull().default('pending'),
    httpsMode: httpsModeEnum('https_mode').notNull().default('off'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('domains_fqdn_unique').on(t.fqdn)],
);

export const databases = pgTable(
  'databases',
  {
    id: id(),
    subscriptionId: text('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id),
    engine: dbEngineEnum('engine').notNull(),
    dbName: text('db_name').notNull(),
    sizeBytesCached: bigint('size_bytes_cached', { mode: 'number' }).notNull().default(0),
    state: resourceStateEnum('state').notNull().default('pending'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('databases_engine_name_unique').on(t.engine, t.dbName)],
);

export const databaseUsers = pgTable('database_users', {
  id: id(),
  databaseId: text('database_id')
    .notNull()
    .references(() => databases.id),
  engine: dbEngineEnum('engine').notNull(),
  username: text('username').notNull(),
  grants: jsonb('grants').$type<string[]>().notNull().default([]),
  passwordSetAt: timestamp('password_set_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const certificates = pgTable('certificates', {
  id: id(),
  domainId: text('domain_id')
    .notNull()
    .references(() => domains.id),
  serverId: text('server_id')
    .notNull()
    .references(() => servers.id),
  provider: certProviderEnum('provider').notNull().default('letsencrypt'),
  status: certStatusEnum('status').notNull().default('pending'),
  sans: jsonb('sans').$type<string[]>().notNull().default([]),
  notBefore: timestamp('not_before', { withTimezone: true }),
  notAfter: timestamp('not_after', { withTimezone: true }),
  fingerprint: text('fingerprint'),
  keyPath: text('key_path'),
  chainPath: text('chain_path'),
  autoRenew: boolean('auto_renew').notNull().default(true),
  createdAt: createdAt(),
});

export const sftpUsers = pgTable('sftp_users', {
  id: id(),
  systemUserId: text('system_user_id')
    .notNull()
    .references(() => systemUsers.id),
  subscriptionId: text('subscription_id')
    .notNull()
    .references(() => subscriptions.id),
  unixUsername: text('unix_username').notNull(),
  chrootDir: text('chroot_dir').notNull(),
  state: resourceStateEnum('state').notNull().default('pending'),
  createdAt: createdAt(),
});

export const dnsRecords = pgTable('dns_records', {
  id: id(),
  domainId: text('domain_id')
    .notNull()
    .references(() => domains.id),
  type: dnsTypeEnum('type').notNull(),
  name: text('name').notNull(),
  value: text('value').notNull(),
  ttl: integer('ttl').notNull().default(3600),
  managed: boolean('managed').notNull().default(false),
  createdAt: createdAt(),
});

// ── Operations & integrity ──────────────────────────────────────────────────────────
export const reconcileIntents = pgTable(
  'reconcile_intents',
  {
    id: id(),
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id),
    subscriptionId: text('subscription_id').references(() => subscriptions.id),
    kind: text('kind').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    desiredState: jsonb('desired_state').$type<Record<string, unknown>>().notNull(),
    status: intentStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('reconcile_intents_idem_unique').on(t.idempotencyKey)],
);

export const auditEvents = pgTable('audit_events', {
  id: id(),
  at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
  actorUserId: text('actor_user_id').references(() => users.id),
  actorIp: text('actor_ip'),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  requestId: text('request_id'),
  commandHash: text('command_hash'),
  outcome: auditOutcomeEnum('outcome').notNull(),
  detailJson: jsonb('detail_json').$type<Record<string, unknown>>(),
});

// ── Inferred row types ──────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Server = typeof servers.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Domain = typeof domains.$inferSelect;
export type NewDomain = typeof domains.$inferInsert;
export type Database = typeof databases.$inferSelect;
export type Certificate = typeof certificates.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type ReconcileIntent = typeof reconcileIntents.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
