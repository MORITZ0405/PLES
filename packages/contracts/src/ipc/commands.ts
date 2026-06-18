import { z } from 'zod';
import { DbEngine, DomainName, GrantSet, HttpsMode, PhpVersion } from '../validation/idents';

/**
 * The subject context carried on every privileged command.
 *
 * The daemon does NOT trust `subscriptionId` as authorization — it re-derives the
 * canonical resource namespace from this id against its own read-only DB view and
 * rejects any command whose targets don't match what the subscription may own.
 */
export const SubjectCtx = z
  .object({
    requestId: z.string().uuid(),
    actorUserId: z.string().uuid(),
    subscriptionId: z.string().uuid(),
  })
  .strict();
export type SubjectCtx = z.infer<typeof SubjectCtx>;

/**
 * The closed, whitelisted set of privileged operations.
 *
 * Deliberately absent: any `runShell` verb, and any command carrying raw config
 * text. Config is rendered *inside* the daemon from these validated fields.
 */
export const Command = z.discriminatedUnion('type', [
  // ── Web server ──────────────────────────────────────────────────────────────
  z
    .object({
      type: z.literal('webserver.upsertVhost'),
      ctx: SubjectCtx,
      domainId: z.string().uuid(),
      fqdn: DomainName,
      aliases: z.array(DomainName).max(50).default([]),
      phpVersion: PhpVersion.nullable(),
      httpsMode: HttpsMode,
    })
    .strict(),
  z
    .object({
      type: z.literal('webserver.removeVhost'),
      ctx: SubjectCtx,
      domainId: z.string().uuid(),
    })
    .strict(),

  // ── System users ────────────────────────────────────────────────────────────
  z.object({ type: z.literal('sysuser.ensure'), ctx: SubjectCtx }).strict(),
  z
    .object({
      type: z.literal('sysuser.setPassword'),
      ctx: SubjectCtx,
      sftpUserId: z.string().uuid(),
      password: z.string().min(16).max(256),
    })
    .strict(),
  z.object({ type: z.literal('sysuser.remove'), ctx: SubjectCtx }).strict(),

  // ── Databases ────────────────────────────────────────────────────────────────
  z
    .object({
      type: z.literal('db.create'),
      ctx: SubjectCtx,
      engine: DbEngine,
      databaseId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal('db.drop'),
      ctx: SubjectCtx,
      engine: DbEngine,
      databaseId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal('db.upsertUser'),
      ctx: SubjectCtx,
      engine: DbEngine,
      databaseUserId: z.string().uuid(),
      password: z.string().min(16).max(256),
    })
    .strict(),
  z
    .object({
      type: z.literal('db.grant'),
      ctx: SubjectCtx,
      engine: DbEngine,
      databaseUserId: z.string().uuid(),
      privileges: GrantSet,
    })
    .strict(),

  // ── Certificates ─────────────────────────────────────────────────────────────
  z
    .object({ type: z.literal('cert.issue'), ctx: SubjectCtx, domainId: z.string().uuid() })
    .strict(),
  z
    .object({
      type: z.literal('cert.renew'),
      ctx: SubjectCtx,
      certificateId: z.string().uuid(),
    })
    .strict(),

  // ── Operational ──────────────────────────────────────────────────────────────
  z
    .object({ type: z.literal('admin.killSwitch'), ctx: SubjectCtx, enabled: z.boolean() })
    .strict(),
]);
export type Command = z.infer<typeof Command>;
export type CommandType = Command['type'];

/** Narrow a command to a specific variant by its `type` discriminator. */
export type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;
