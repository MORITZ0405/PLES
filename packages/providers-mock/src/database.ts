import path from 'node:path';
import type { Config } from '@lest/config';
import type { DbEngine, Privilege } from '@lest/contracts';
import type { DatabaseProvider, ProviderCtx } from '@lest/core';
import { JsonStore } from './store';

interface DbRegistry {
  databases: Record<string, { engine: DbEngine }>;
  users: Record<string, { grants: Privilege[]; hasPassword: boolean }>;
}

export class MockDatabaseProvider implements DatabaseProvider {
  private readonly store: JsonStore<DbRegistry>;

  constructor(
    cfg: Config,
    public readonly engine: DbEngine,
  ) {
    this.store = new JsonStore<DbRegistry>(
      path.join(cfg.devDir, 'state', `db-${engine}.json`),
      { databases: {}, users: {} },
    );
  }

  async createDatabase(_ctx: ProviderCtx, databaseId: string): Promise<void> {
    await this.store.update((reg) => {
      reg.databases[databaseId] = { engine: this.engine };
    });
  }

  async dropDatabase(_ctx: ProviderCtx, databaseId: string): Promise<void> {
    await this.store.update((reg) => {
      delete reg.databases[databaseId];
    });
  }

  async upsertUser(_ctx: ProviderCtx, databaseUserId: string, _password: string): Promise<void> {
    await this.store.update((reg) => {
      reg.users[databaseUserId] = { grants: reg.users[databaseUserId]?.grants ?? [], hasPassword: true };
    });
  }

  async grant(_ctx: ProviderCtx, databaseUserId: string, privileges: Privilege[]): Promise<void> {
    await this.store.update((reg) => {
      reg.users[databaseUserId] = { grants: privileges, hasPassword: reg.users[databaseUserId]?.hasPassword ?? false };
    });
  }

  async getSize(_ctx: ProviderCtx, _databaseId: string): Promise<{ sizeMb: number }> {
    return { sizeMb: 0 };
  }
}
