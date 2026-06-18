import type { AgentResponse, Command, DbEngine, HttpsMode, PhpVersion, Privilege } from '@lest/contracts';

/**
 * Context threaded through every provider call: identifies the actor and the
 * subscription/server the operation targets. In prod, the daemon re-derives
 * ownership from `subscriptionId` — these fields are a claim, not an authorization.
 */
export interface ProviderCtx {
  requestId: string;
  actorUserId: string;
  subscriptionId: string;
  serverId: string;
}

/** The single chokepoint to the privileged trust boundary. */
export interface AgentClient {
  send<T = unknown>(
    ctx: ProviderCtx,
    command: Command,
    idempotencyKey: string,
  ): Promise<AgentResponse<T>>;
  ping(): Promise<{ ok: true; version: string }>;
}

export interface VhostSpec {
  domainId: string;
  fqdn: string;
  aliases: string[];
  /** Server-generated; confined under the subscription home directory. */
  docRoot: string;
  phpVersion: PhpVersion | null;
  httpsMode: HttpsMode;
  certPath?: string;
  keyPath?: string;
}

export interface WebServerProvider {
  upsertVhost(ctx: ProviderCtx, spec: VhostSpec): Promise<void>;
  removeVhost(ctx: ProviderCtx, domainId: string): Promise<void>;
  reload(ctx: ProviderCtx): Promise<void>;
}

export interface SystemUserProvider {
  ensure(ctx: ProviderCtx): Promise<{ unixUsername: string; uid: number; homeDir: string }>;
  setPassword(ctx: ProviderCtx, sftpUserId: string, password: string): Promise<void>;
  remove(ctx: ProviderCtx): Promise<void>;
  getUsage(ctx: ProviderCtx): Promise<{ diskMb: number }>;
}

export interface DatabaseProvider {
  readonly engine: DbEngine;
  createDatabase(ctx: ProviderCtx, databaseId: string): Promise<void>;
  dropDatabase(ctx: ProviderCtx, databaseId: string): Promise<void>;
  upsertUser(ctx: ProviderCtx, databaseUserId: string, password: string): Promise<void>;
  grant(ctx: ProviderCtx, databaseUserId: string, privileges: Privilege[]): Promise<void>;
  getSize(ctx: ProviderCtx, databaseId: string): Promise<{ sizeMb: number }>;
}

export interface CertResult {
  certificateId: string;
  notAfter: string;
  keyPath: string;
  chainPath: string;
  sans: string[];
}

export interface CertProvider {
  issue(ctx: ProviderCtx, domainId: string): Promise<CertResult>;
  renew(ctx: ProviderCtx, certificateId: string): Promise<CertResult>;
}

export interface DnsRecordInput {
  domainId: string;
  type: 'A' | 'CNAME' | 'TXT';
  name: string;
  value: string;
  ttl?: number;
}

export interface DnsProvider {
  upsertRecord(ctx: ProviderCtx, record: DnsRecordInput): Promise<void>;
  deleteRecord(ctx: ProviderCtx, record: Omit<DnsRecordInput, 'value' | 'ttl'>): Promise<void>;
}

/** The full provider bundle the composition root assembles and injects into services. */
export interface Providers {
  webServer: WebServerProvider;
  systemUser: SystemUserProvider;
  databases: Record<DbEngine, DatabaseProvider>;
  cert: CertProvider;
  dns: DnsProvider;
  agent: AgentClient;
}
