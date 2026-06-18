import path from 'node:path';
import type { Config } from '@lest/config';
import { deriveUnixUsername, type ProviderCtx, type SystemUserProvider } from '@lest/core';
import { JsonStore } from './store';

interface UserRegistry {
  nextUid: number;
  users: Record<string, { unixUsername: string; uid: number; homeDir: string }>;
  passwords: Record<string, string>;
}

const UID_BASE = 70_000;

export class MockSystemUserProvider implements SystemUserProvider {
  private readonly store: JsonStore<UserRegistry>;

  constructor(cfg: Config) {
    this.store = new JsonStore<UserRegistry>(path.join(cfg.devDir, 'state', 'system-users.json'), {
      nextUid: UID_BASE,
      users: {},
      passwords: {},
    });
  }

  async ensure(ctx: ProviderCtx): Promise<{ unixUsername: string; uid: number; homeDir: string }> {
    const unixUsername = deriveUnixUsername(ctx.subscriptionId);
    let entry: { unixUsername: string; uid: number; homeDir: string } | undefined;
    await this.store.update((reg) => {
      const existing = reg.users[ctx.subscriptionId];
      if (existing) {
        entry = existing;
        return;
      }
      entry = { unixUsername, uid: reg.nextUid, homeDir: `/var/www/${unixUsername}` };
      reg.users[ctx.subscriptionId] = entry;
      reg.nextUid += 1;
    });
    return entry!;
  }

  async setPassword(ctx: ProviderCtx, sftpUserId: string, _password: string): Promise<void> {
    await this.store.update((reg) => {
      reg.passwords[sftpUserId] = '***set***';
    });
    void ctx;
  }

  async remove(ctx: ProviderCtx): Promise<void> {
    await this.store.update((reg) => {
      delete reg.users[ctx.subscriptionId];
    });
  }

  async getUsage(_ctx: ProviderCtx): Promise<{ diskMb: number }> {
    return { diskMb: 0 };
  }
}
