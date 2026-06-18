import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';

const isWin = process.platform === 'win32';

/**
 * Walk up from `start` to the monorepo root (the package.json named "lest" with a
 * workspaces field) so a relative LEST_DEV_DIR resolves to the SAME absolute path
 * no matter which workspace's cwd a process is launched from.
 */
function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    const pj = path.join(dir, 'package.json');
    if (existsSync(pj)) {
      try {
        const j = JSON.parse(readFileSync(pj, 'utf8')) as { name?: string; workspaces?: unknown };
        if (j.name === 'lest' && j.workspaces) return dir;
      } catch {
        /* ignore unreadable package.json */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

/**
 * Raw environment schema. Every knob LEST reads lives here and nowhere else.
 * Defaults are dev-safe; production overrides are validated, not assumed.
 */
const EnvSchema = z
  .object({
    /** 'mock' = in-process mock agent (Windows dev). 'agent' = real unix-socket daemon. */
    LEST_MODE: z.enum(['mock', 'agent']).default(isWin ? 'mock' : 'agent'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    LEST_HTTP_HOST: z.string().default('127.0.0.1'),
    LEST_HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(4317),

    /** Working dir for dev artifacts (PGlite data + mock nginx/users/certs). */
    LEST_DEV_DIR: z.string().default('./.lest-dev'),

    /** When set, LEST uses real PostgreSQL; otherwise embedded PGlite under LEST_DEV_DIR. */
    DATABASE_URL: z.string().optional(),

    /** Cookie/session signing secret. The dev default MUST be overridden in production. */
    LEST_SESSION_SECRET: z
      .string()
      .min(16)
      .default('dev-only-insecure-session-secret-change-me'),
    LEST_COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    /** Session lifetime in hours. */
    LEST_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(24),

    /** Privileged daemon socket (mode=agent). */
    LEST_AGENT_SOCKET: z.string().default('/run/lest/agentd.sock'),
    /** Shared HMAC key for the agent envelope (mode=agent). Required when mode=agent. */
    LEST_AGENT_HMAC_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.LEST_MODE === 'agent' && !env.LEST_AGENT_HMAC_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LEST_AGENT_HMAC_KEY'],
        message: 'LEST_AGENT_HMAC_KEY is required when LEST_MODE=agent',
      });
    }
    if (env.NODE_ENV === 'production' && env.LEST_SESSION_SECRET.startsWith('dev-only')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LEST_SESSION_SECRET'],
        message: 'LEST_SESSION_SECRET must be set in production',
      });
    }
  });

export type DatabaseConfig =
  | { kind: 'pglite'; dataDir: string }
  | { kind: 'postgres'; url: string };

export interface Config {
  mode: 'mock' | 'agent';
  nodeEnv: 'development' | 'test' | 'production';
  http: { host: string; port: number };
  devDir: string;
  database: DatabaseConfig;
  session: { secret: string; cookieSecure: boolean; ttlHours: number };
  agent: { socketPath: string; hmacKey: string | undefined };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.parse(env);
  const devDir = path.isAbsolute(parsed.LEST_DEV_DIR)
    ? parsed.LEST_DEV_DIR
    : path.join(findRepoRoot(process.cwd()), parsed.LEST_DEV_DIR);

  const database: DatabaseConfig = parsed.DATABASE_URL
    ? { kind: 'postgres', url: parsed.DATABASE_URL }
    : { kind: 'pglite', dataDir: path.join(devDir, 'pgdata') };

  return {
    mode: parsed.LEST_MODE,
    nodeEnv: parsed.NODE_ENV,
    http: { host: parsed.LEST_HTTP_HOST, port: parsed.LEST_HTTP_PORT },
    devDir,
    database,
    session: {
      secret: parsed.LEST_SESSION_SECRET,
      cookieSecure: parsed.LEST_COOKIE_SECURE,
      ttlHours: parsed.LEST_SESSION_TTL_HOURS,
    },
    agent: { socketPath: parsed.LEST_AGENT_SOCKET, hmacKey: parsed.LEST_AGENT_HMAC_KEY },
  };
}
