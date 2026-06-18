import { randomUUID } from 'node:crypto';

export function newId(): string {
  return randomUUID();
}

/** Short hex tag derived from a uuid; used for namespaced unix/db identifiers. */
export function shortTag(uuid: string): string {
  return uuid.replace(/-/g, '').slice(0, 8);
}

/** The single canonical unix username for a subscription. Always LEST-namespaced. */
export function deriveUnixUsername(subscriptionId: string): string {
  return `lest_${shortTag(subscriptionId)}`;
}

/** A server-generated, namespaced database/user identifier. */
export function deriveDbIdent(subscriptionId: string, slug: string): string {
  const clean = slug.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
  return `lest_${shortTag(subscriptionId)}_${clean}`;
}

/** A document root under the subscription's home directory. */
export function deriveDocRoot(homeDir: string, fqdn: string): string {
  return `${homeDir}/${fqdn}`;
}

export function newIdempotencyKey(): string {
  return `ri_${randomUUID()}`;
}
