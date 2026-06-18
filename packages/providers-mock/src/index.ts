import type { Config } from '@lest/config';
import type { Providers } from '@lest/core';
import { MockCertProvider } from './cert';
import { MockDatabaseProvider } from './database';
import { NoopDnsProvider } from './dns';
import { InProcessAgent } from './in-process-agent';
import { MockSystemUserProvider } from './system-user';
import { MockWebServerProvider } from './web-server';

export { MockWebServerProvider } from './web-server';
export { MockSystemUserProvider } from './system-user';
export { MockDatabaseProvider } from './database';
export { MockCertProvider } from './cert';
export { NoopDnsProvider } from './dns';
export { InProcessAgent } from './in-process-agent';

/** Assemble the full mock provider bundle for dev / tests (no privileges, no socket). */
export function buildMockProviders(cfg: Config): Providers {
  return {
    webServer: new MockWebServerProvider(cfg),
    systemUser: new MockSystemUserProvider(cfg),
    databases: {
      mysql: new MockDatabaseProvider(cfg, 'mysql'),
      postgres: new MockDatabaseProvider(cfg, 'postgres'),
    },
    cert: new MockCertProvider(cfg),
    dns: new NoopDnsProvider(),
    agent: new InProcessAgent(),
  };
}
