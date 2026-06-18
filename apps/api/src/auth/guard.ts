import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from '@lest/core';
import type { Container } from '../container';
import { resolveSession, SESSION_COOKIE } from './sessions';

/** Build a Fastify preHandler that attaches the authenticated actor to the request. */
export function makeAuthenticate(container: Container) {
  return async function authenticate(req: FastifyRequest): Promise<void> {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) throw new UnauthorizedError();
    const resolved = await resolveSession(container.db, token);
    if (!resolved) throw new UnauthorizedError();
    req.currentUser = resolved.user;
    req.actor = {
      userId: resolved.user.id,
      role: resolved.user.role,
      customerId: resolved.user.customerId,
    };
  };
}
