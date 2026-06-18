import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db, Session, User } from '@lest/db';
import { sessions, users } from '@lest/db';
import { newId } from '@lest/core';

export const SESSION_COOKIE = 'lest_session';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface SessionMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/** Create a server-side, revocable session. Returns the opaque cookie token. */
export async function createSession(
  db: Db,
  userId: string,
  ttlHours: number,
  meta: SessionMeta,
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.insert(sessions).values({
    id: newId(),
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlHours * 3600 * 1000),
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  });
  return token;
}

export interface ResolvedSession {
  user: User;
  session: Session;
}

/** Resolve a cookie token to its active user, or null if invalid/expired/revoked. */
export async function resolveSession(db: Db, token: string): Promise<ResolvedSession | null> {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);
  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) return null;

  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user || user.status !== 'active') return null;

  await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, session.id));
  return { user, session };
}

export async function revokeSession(db: Db, token: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.tokenHash, hashToken(token)));
}
