import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '@lest/config';
import type { ProviderCtx, VhostSpec, WebServerProvider } from '@lest/core';
import { renderNginxVhost } from '@lest/rendering';

/** Writes real nginx config text under <devDir>/etc/nginx — exactly what the daemon would produce. */
export class MockWebServerProvider implements WebServerProvider {
  private readonly sitesAvailable: string;
  private readonly sitesEnabled: string;

  constructor(cfg: Config) {
    this.sitesAvailable = path.join(cfg.devDir, 'etc', 'nginx', 'sites-available');
    this.sitesEnabled = path.join(cfg.devDir, 'etc', 'nginx', 'sites-enabled');
  }

  async upsertVhost(_ctx: ProviderCtx, spec: VhostSpec): Promise<void> {
    await mkdir(this.sitesAvailable, { recursive: true });
    await mkdir(this.sitesEnabled, { recursive: true });
    const conf = renderNginxVhost(spec);
    const name = `${spec.domainId}.conf`;
    await writeFile(path.join(this.sitesAvailable, name), conf, 'utf8');
    // Emulate the sites-enabled symlink with a copy (Windows-friendly).
    await writeFile(path.join(this.sitesEnabled, name), conf, 'utf8');
  }

  async removeVhost(_ctx: ProviderCtx, domainId: string): Promise<void> {
    const name = `${domainId}.conf`;
    await rm(path.join(this.sitesAvailable, name), { force: true });
    await rm(path.join(this.sitesEnabled, name), { force: true });
  }

  async reload(_ctx: ProviderCtx): Promise<void> {
    // Mock: a real provider would `nginx -t` then `systemctl reload nginx`.
  }
}
