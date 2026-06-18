import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Config } from '@lest/config';
import type { CertProvider, CertResult, ProviderCtx } from '@lest/core';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/** Writes placeholder cert/key files so the SSL UI is exercisable in dev. */
export class MockCertProvider implements CertProvider {
  private readonly liveDir: string;

  constructor(cfg: Config) {
    this.liveDir = path.join(cfg.devDir, 'etc', 'letsencrypt', 'live');
  }

  async issue(_ctx: ProviderCtx, domainId: string): Promise<CertResult> {
    return this.write(domainId);
  }

  async renew(_ctx: ProviderCtx, certificateId: string): Promise<CertResult> {
    return this.write(certificateId);
  }

  private async write(key: string): Promise<CertResult> {
    const dir = path.join(this.liveDir, key);
    await mkdir(dir, { recursive: true });
    const chainPath = path.join(dir, 'fullchain.pem');
    const keyPath = path.join(dir, 'privkey.pem');
    await writeFile(chainPath, `# LEST mock certificate for ${key}\n`, 'utf8');
    await writeFile(keyPath, `# LEST mock private key for ${key}\n`, 'utf8');
    return {
      certificateId: randomUUID(),
      notAfter: new Date(Date.now() + NINETY_DAYS_MS).toISOString(),
      keyPath,
      chainPath,
      sans: [],
    };
  }
}
