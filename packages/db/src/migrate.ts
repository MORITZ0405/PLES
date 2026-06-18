import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '@lest/config';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(here, '..', 'drizzle');

async function main() {
  const cfg = loadConfig();
  const handle = await createDb(cfg);
  // eslint-disable-next-line no-console
  console.log(`[lest:db] applying migrations (${handle.kind}) from ${migrationsFolder}`);

  if (handle.kind === 'pglite') {
    await migratePglite(handle.db as never, { migrationsFolder });
  } else {
    await migratePg(handle.db as never, { migrationsFolder });
  }

  await handle.close();
  // eslint-disable-next-line no-console
  console.log('[lest:db] migrations applied');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[lest:db] migration failed:', err);
  process.exit(1);
});
