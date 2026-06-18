import type { Actor } from '@lest/core';
import type { User } from '@lest/db';

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor | null;
    currentUser: User | null;
  }
}
