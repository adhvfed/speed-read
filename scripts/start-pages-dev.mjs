import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const port = process.env.APP_PORT;
if (!port || !/^\d+$/.test(port)) throw new Error('APP_PORT must be a valid port.');

let child;
const waitFor = (process) => new Promise((resolveExit) => {
  process.on('exit', (code, signal) => resolveExit({ code, signal }));
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child?.kill(signal));
}

child = spawn('npm', ['run', 'build'], {
  env: {
    PATH: process.env.PATH ?? '',
    TMPDIR: process.env.TMPDIR ?? '/tmp',
  },
  stdio: 'inherit',
});
const buildExit = await waitFor(child);
if (buildExit.code !== 0) process.exit(buildExit.code ?? 1);

// Launch Wrangler directly so npm cannot add its own environment variables.
// The linked API key moves from fed to the Worker process without a dotenv file.
const runtimeEnvironment = {
  CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
};

child = spawn(process.execPath, [
  resolve('node_modules/wrangler/bin/wrangler.js'),
  'pages',
  'dev',
  'dist',
  '--port',
  port,
], {
  env: runtimeEnvironment,
  stdio: 'inherit',
});
const runtimeExit = await waitFor(child);
process.exit(runtimeExit.code ?? (runtimeExit.signal ? 128 : 1));
