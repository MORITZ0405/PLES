#!/usr/bin/env node
/**
 * Run the API and web dev servers together with prefixed, color-coded logs.
 * Ctrl-C stops both. Cross-platform (uses shell:true so npm.cmd works on Windows).
 */
import { spawn } from 'node:child_process';

const targets = [
  { name: 'api', script: 'dev:api', color: '\x1b[36m' },
  { name: 'web', script: 'dev:web', color: '\x1b[35m' },
];

const children = [];

function start({ name, script, color }) {
  const prefix = `${color}[${name}]\x1b[0m `;
  const child = spawn('npm', ['run', script], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });

  const forward = (stream, out) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) out.write(prefix + line + '\n');
    });
  };
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);
  child.on('exit', (code) => {
    process.stdout.write(prefix + `exited (${code})\n`);
    shutdown();
  });
  children.push(child);
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('Starting LEST dev servers (Ctrl-C to stop)…');
targets.forEach(start);
