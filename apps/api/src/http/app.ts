import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '@lest/core';
import type { Container } from '../container';
import { registerRoutes } from './routes';

export async function buildApp(container: Container): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: 'info' },
    trustProxy: true,
  });

  await app.register(cookie);
  await app.register(cors, { origin: true, credentials: true });

  app.decorateRequest('actor', null);
  app.decorateRequest('currentUser', null);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply
        .status(err.httpStatus)
        .send({ error: err.code, message: err.message, details: err.details });
    }
    if (err instanceof ZodError) {
      return reply
        .status(400)
        .send({ error: 'validation', message: 'invalid request', details: err.flatten() });
    }
    reply.log.error(err);
    return reply.status(500).send({ error: 'internal', message: 'internal server error' });
  });

  registerRoutes(app, container);
  return app;
}
