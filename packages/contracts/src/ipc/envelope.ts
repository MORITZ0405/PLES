import { z } from 'zod';
import { Command } from './commands';

export const ENVELOPE_VERSION = 1 as const;

/** Maximum clock skew, in milliseconds, the daemon accepts on an envelope timestamp. */
export const ENVELOPE_TS_WINDOW_MS = 30_000;

/**
 * The wire envelope. The HMAC authenticates the *channel* (proves the message came
 * from the `lest` user holding the shared key); it does NOT convey authorization —
 * authorization is re-derived by the daemon from the command's SubjectCtx.
 */
export const Envelope = z
  .object({
    v: z.literal(ENVELOPE_VERSION),
    id: z.string().uuid(),
    ts: z.number().int().positive(),
    idempotencyKey: z.string().min(1).max(128),
    hmac: z.string().min(1),
    command: Command,
  })
  .strict();
export type Envelope = z.infer<typeof Envelope>;

/** The subset of envelope fields covered by the HMAC (everything except `hmac`). */
export type SignedFields = Omit<Envelope, 'hmac'>;

/**
 * Deterministic canonical JSON: object keys sorted recursively. Both signer and
 * verifier serialize identically, so the HMAC is stable regardless of key order.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys.map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') +
    '}'
  );
}

/** The exact string the HMAC is computed over. */
export function signedPayload(fields: SignedFields): string {
  return canonicalize({
    v: fields.v,
    id: fields.id,
    ts: fields.ts,
    idempotencyKey: fields.idempotencyKey,
    command: fields.command,
  });
}
