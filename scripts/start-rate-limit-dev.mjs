import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const port = process.env.LIMITER_PORT;
if (!port || !/^\d+$/.test(port)) throw new Error('LIMITER_PORT must be a valid port.');

const child = spawn(process.execPath, [
  resolve('node_modules/wrangler/bin/wrangler.js'),
  'dev',
  '--config',
  'wrangler.rate-limit.toml',
  '--port',
  port,
  '--show-interactive-dev-session=false',
], {
  env: {
    PATH: process.env.PATH ?? '',
    TMPDIR: process.env.TMPDIR ?? '/tmp',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => process.exit(code ?? (signal ? 128 : 1)));
