import { z } from 'zod';
import { DomainName, HttpsMode, PhpVersion } from '../validation/idents';

/** Roles, mirrored from the data model for use at the HTTP edge. */
export const Role = z.enum(['admin', 'reseller', 'customer']);
export type Role = z.infer<typeof Role>;

// ── Auth ────────────────────────────────────────────────────────────────────────
export const LoginRequest = z
  .object({
    email: z.string().email(),
    password: z.string().min(1).max(256),
    totp: z.string().min(6).max(8).optional(),
  })
  .strict();
export type LoginRequest = z.infer<typeof LoginRequest>;

export const MeResponse = z.object({
  id: z.string(),
  email: z.string(),
  role: Role,
  customerId: z.string().nullable(),
});
export type MeResponse = z.infer<typeof MeResponse>;

// ── Domains ───────────────────────────────────────────────────────────────────────
export const DomainType = z.enum(['primary', 'addon', 'subdomain', 'alias']);
export type DomainType = z.infer<typeof DomainType>;

export const VhostState = z.enum(['pending', 'live', 'disabled']);
export type VhostState = z.infer<typeof VhostState>;

export const CreateDomainRequest = z
  .object({
    fqdn: DomainName,
    type: DomainType.default('primary'),
    phpVersion: PhpVersion.nullable().default(null),
    httpsMode: HttpsMode.default('off'),
  })
  .strict();
export type CreateDomainRequest = z.infer<typeof CreateDomainRequest>;

export const DomainDto = z.object({
  id: z.string(),
  subscriptionId: z.string(),
  fqdn: z.string(),
  type: DomainType,
  docRoot: z.string(),
  phpVersion: z.string().nullable(),
  vhostState: VhostState,
  httpsMode: HttpsMode,
  createdAt: z.string(),
});
export type DomainDto = z.infer<typeof DomainDto>;

// ── Subscriptions (read-only surface used by M1) ────────────────────────────────────
export const SubscriptionDto = z.object({
  id: z.string(),
  customerId: z.string(),
  planId: z.string(),
  state: z.enum(['active', 'suspended', 'terminated']),
  effectiveLimits: z.record(z.string(), z.unknown()),
  domainCount: z.number(),
});
export type SubscriptionDto = z.infer<typeof SubscriptionDto>;

/** Uniform API error body. */
export const ApiError = z.object({
  error: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiError>;
