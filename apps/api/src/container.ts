import { loadConfig, type Config } from '@lest/config';
import { getDb, type Db } from '@lest/db';
import { DomainService, SubscriptionService, type Providers } from '@lest/core';
import { buildMockProviders } from '@lest/providers-mock';

/**
 * Composition root. The ONLY place providers are constructed. In `mock` mode it wires
 * the in-process mocks; in `agent` mode it will wire the SocketAgentClient-backed
 * `providers-linux` (M2+). The web tier never constructs providers itself.
 */
export interface Container {
  cfg: Config;
  db: Db;
  providers: Providers;
  domains: DomainService;
  subscriptions: SubscriptionService;
}

export async function buildContainer(): Promise<Container> {
  const cfg = loadConfig();
  const db = await getDb(cfg);

  let providers: Providers;
  if (cfg.mode === 'mock') {
    providers = buildMockProviders(cfg);
  } else {
    throw new Error(
      'LEST_MODE=agent requires the Linux provider layer (providers-linux + lest-agentd), ' +
        'which lands in milestone M2+. Run in mock mode for now.',
    );
  }

  return {
    cfg,
    db,
    providers,
    domains: new DomainService(db, providers),
    subscriptions: new SubscriptionService(db),
  };
}
