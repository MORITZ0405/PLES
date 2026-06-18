import type { Role } from '@lest/contracts';
import type { Subscription } from '@lest/db';
import { ForbiddenError } from './errors';

export interface Actor {
  userId: string;
  role: Role;
  customerId: string | null;
}

/**
 * Authoritative tenant scoping. v1: admin sees all; a customer sees only its own
 * customer's subscriptions. Reseller subtree restriction is wired in M3 (see DESIGN.md);
 * until then a reseller is treated as scoped-to-all and this is the single place to tighten.
 */
export function assertSubscriptionAccess(actor: Actor, sub: Pick<Subscription, 'customerId'>): void {
  if (actor.role === 'admin') return;
  if (actor.role === 'reseller') return; // TODO(M3): restrict to reseller subtree
  if (actor.role === 'customer' && actor.customerId && actor.customerId === sub.customerId) return;
  throw new ForbiddenError('not allowed for this subscription');
}
