import type { DnsProvider, ProviderCtx, DnsRecordInput } from '@lest/core';

/** v1 default DNS provider: records are tracked in the metadata DB but not pushed anywhere. */
export class NoopDnsProvider implements DnsProvider {
  async upsertRecord(_ctx: ProviderCtx, _record: DnsRecordInput): Promise<void> {
    // intentionally no-op
  }

  async deleteRecord(_ctx: ProviderCtx, _record: Omit<DnsRecordInput, 'value' | 'ttl'>): Promise<void> {
    // intentionally no-op
  }
}
