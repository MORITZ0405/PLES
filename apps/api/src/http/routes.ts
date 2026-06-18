import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { CreateDomainRequest, LoginRequest, type MeResponse } from '@lest/contracts';
import { UnauthorizedError } from '@lest/core';
import { users } from '@lest/db';
import type { Container } from '../container';
import { makeAuthenticate } from '../auth/guard';
import { verifyPassword } from '../auth/passwords';
import { createSession, revokeSession, SESSION_COOKIE } from '../auth/sessions';

export function registerRoutes(app: FastifyInstance, c: Container): void {
  const authenticate = makeAuthenticate(c);
  const auth = { preHandler: authenticate };

  // ── Health ────────────────────────────────────────────────────────────────────
  app.get('/api/v1/health', async () => ({ status: 'ok', mode: c.cfg.mode }));

  // ── Auth ──────────────────────────────────────────────────────────────────────
  app.post('/api/v1/auth/login', async (req, reply) => {
    const body = LoginRequest.parse(req.body);
    const email = body.email.toLowerCase();
    const [user] = await c.db.select().from(users).where(eq(users.email, email)).limit(1);
    const passwordOk = user ? await verifyPassword(user.passwordHash, body.password) : false;
    if (!user || !passwordOk || user.status !== 'active') {
      throw new UnauthorizedError('invalid credentials');
    }
    const token = await createSession(c.db, user.id, c.cfg.session.ttlHours, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: c.cfg.session.cookieSecure,
      path: '/',
      maxAge: c.cfg.session.ttlHours * 3600,
    });
    const me: MeResponse = {
      id: user.id,
      email: user.email,
      role: user.role,
      customerId: user.customerId,
    };
    return reply.send(me);
  });

  app.post('/api/v1/auth/logout', auth, async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await revokeSession(c.db, token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.send({ ok: true });
  });

  app.get('/api/v1/auth/me', auth, async (req) => {
    const u = req.currentUser!;
    const me: MeResponse = { id: u.id, email: u.email, role: u.role, customerId: u.customerId };
    return me;
  });

  // ── Subscriptions ───────────────────────────────────────────────────────────────
  app.get('/api/v1/subscriptions', auth, async (req) => c.subscriptions.list(req.actor!));

  // ── Domains ─────────────────────────────────────────────────────────────────────
  app.get('/api/v1/subscriptions/:id/domains', auth, async (req) => {
    const { id } = req.params as { id: string };
    return c.domains.list(req.actor!, id);
  });

  app.post('/api/v1/subscriptions/:id/domains', auth, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = CreateDomainRequest.parse(req.body);
    const dto = await c.domains.create(req.actor!, id, body, { ip: req.ip });
    return reply.status(201).send(dto);
  });
}
