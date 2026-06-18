import path from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Config } from '@lest/config';
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

/**
 * Both drivers speak the Postgres dialect, so one schema and one query surface serve
 * dev (PGlite, embedded WASM) and prod (PostgreSQL, node-postgres) identically.
 */
export type Db = NodePgDatabase<typeof schema> & { $client?: unknown };

export interface DbHandle {
  db: Db;
  kind: 'pglite' | 'postgres';
  close(): Promise<void>;
}

export async function createDb(cfg: Config): Promise<DbHandle> {
  if (cfg.database.kind === 'pglite') {
    mkdirSync(path.dirname(cfg.database.dataDir), { recursive: true });
    const { PGlite } = await import('@electric-sql/pglite');
    const client = new PGlite(cfg.database.dataDir);
    const db = drizzlePglite(client, { schema }) as unknown as Db;
    return {
      db,
      kind: 'pglite',
      close: async () => {
        await client.close();
      },
    };
  }

  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: cfg.database.url });
  const db = drizzlePg(pool, { schema });
  return {
    db,
    kind: 'postgres',
    close: async () => {
      await pool.end();
    },
  };
}

let cached: DbHandle | undefined;

/** Process-wide singleton handle for the running app. */
export async function getDb(cfg: Config): Promise<Db> {
  cached ??= await createDb(cfg);
  return cached.db;
}

export type { PgliteDatabase, NodePgDatabase };
