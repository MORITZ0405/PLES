#!/usr/bin/env node
/**
 * LEST one-command development setup.
 * Installs dependencies, applies DB migrations, and seeds an admin + demo data.
 * Idempotent: safe to re-run (seed skips if data already exists).
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const c = (code, s) => `\x1b[${code}m${s}\x1b[0m`;
const step = (s) => console.log('\n' + c(36, '▸ ' + s));
function run(cmd) {
  console.log('  $ ' + cmd);
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

console.log(c(1, 'LEST — development setup'));

step('Installing dependencies');
run('npm install --no-fund --no-audit');

step('Setting up the database (migrate + seed)');
run('npm run db:push');
run('npm run db:seed');

step('Ready');
console.log(`
${c(32, 'LEST is set up.')} Start the dev servers with:

  ${c(1, 'npm run dev')}        # API + web together (recommended)
  npm run dev:api    # API only -> http://localhost:4317
  npm run dev:web    # web only -> http://localhost:5173

Then open ${c(36, 'http://localhost:5173')} and sign in with the seeded admin
account shown in the seed output above.
`);
