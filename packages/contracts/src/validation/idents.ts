import { z } from 'zod';

/**
 * Branded, refined primitive identifiers shared across every boundary.
 *
 * These are the *only* place an identifier's grammar is defined. The same schema
 * is enforced at the HTTP edge AND re-validated inside the privileged daemon, so
 * a value that type-checks in dev is exactly what the Linux daemon will accept.
 */

export const Uuid = z.string().uuid();

/** A fully-qualified domain name. Lower-cased, length-capped, strict label grammar. */
export const DomainName = z
  .string()
  .min(1)
  .max(253)
  .transform((s) => s.toLowerCase())
  .refine(
    (s) => /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(s),
    'invalid fully-qualified domain name',
  )
  .brand<'DomainName'>();
export type DomainName = z.infer<typeof DomainName>;

/** PHP versions the daemon is allowed to wire into a php-fpm pool. Hard allowlist. */
export const PhpVersion = z.enum(['7.4', '8.1', '8.2', '8.3']);
export type PhpVersion = z.infer<typeof PhpVersion>;

export const DbEngine = z.enum(['mysql', 'postgres']);
export type DbEngine = z.infer<typeof DbEngine>;

export const HttpsMode = z.enum(['off', 'redirect', 'only']);
export type HttpsMode = z.infer<typeof HttpsMode>;

export const Privilege = z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL']);
export type Privilege = z.infer<typeof Privilege>;

/** A non-empty set of grants. SUPER / WITH GRANT OPTION are structurally impossible. */
export const GrantSet = z.array(Privilege).nonempty();
export type GrantSet = z.infer<typeof GrantSet>;

/** Server-generated unix username. Always LEST-namespaced; can never be `root`. */
export const UnixUsername = z
  .string()
  .regex(/^lest_[a-z0-9]{1,24}$/, 'must be a LEST-namespaced unix username')
  .brand<'UnixUsername'>();
export type UnixUsername = z.infer<typeof UnixUsername>;

/** Server-generated database / db-user identifier. */
export const DbIdent = z
  .string()
  .regex(/^[a-z0-9_]{1,32}$/, 'invalid database identifier')
  .brand<'DbIdent'>();
export type DbIdent = z.infer<typeof DbIdent>;

/** An absolute POSIX path with no traversal segments. */
export const AbsPath = z
  .string()
  .startsWith('/', 'must be an absolute POSIX path')
  .refine((p) => !p.split('/').includes('..'), 'path traversal not allowed')
  .brand<'AbsPath'>();
export type AbsPath = z.infer<typeof AbsPath>;

export const Port = z.number().int().min(1).max(65535);
export type Port = z.infer<typeof Port>;
