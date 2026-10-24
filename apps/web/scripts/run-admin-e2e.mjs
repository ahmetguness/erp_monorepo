import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const port = 3100;
const managedBaseUrl = `http://localhost:${port}`;
const webRoot = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const nextCli = require.resolve('next/dist/bin/next');
const playwrightCli = require.resolve('@playwright/test/cli');

async function available(baseUrl) {
  try { return (await fetch(`${baseUrl}/admin/login`, { signal: AbortSignal.timeout(2_000) })).ok; } catch { return false; }
}

async function findExistingServer() {
  const configuredBaseUrl = process.env.ADMIN_E2E_BASE_URL;
  if (configuredBaseUrl) {
    if (await available(configuredBaseUrl)) return configuredBaseUrl;
    throw new Error(`Configured E2E server is unavailable: ${configuredBaseUrl}`);
  }
  if (process.env.CI) return null;
  return await available(managedBaseUrl) ? managedBaseUrl : null;
}

async function waitUntilReady(baseUrl) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await available(baseUrl)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Admin E2E web sunucusu 60 saniye içinde başlamadı.');
}

async function run() {
  await Promise.all([access(nextCli), access(playwrightCli)]);
  const existingBaseUrl = await findExistingServer();
  const ownsServer = existingBaseUrl === null;
  const baseUrl = existingBaseUrl ?? managedBaseUrl;
  const serverMode = process.env.CI ? 'start' : 'dev';
  const serverEnv = process.env.CI ? process.env : { ...process.env, NEXT_DIST_DIR: '.next-e2e' };
  const server = ownsServer
    ? spawn(process.execPath, [nextCli, serverMode, '--hostname', 'localhost', '--port', `${port}`], {
        cwd: webRoot,
        stdio: 'inherit',
        env: serverEnv,
      })
    : null;
  try {
    await waitUntilReady(baseUrl);
    const test = spawn(process.execPath, [playwrightCli, 'test', ...process.argv.slice(2)], {
      cwd: webRoot,
      stdio: 'inherit',
      env: { ...process.env, ADMIN_E2E_EXTERNAL_SERVER: '1', ADMIN_E2E_BASE_URL: baseUrl },
    });
    const exitCode = await new Promise((resolve, reject) => {
      test.once('error', reject);
      test.once('exit', (code) => resolve(code ?? 1));
    });
    process.exitCode = exitCode;
  } finally {
    if (server && !server.killed) {
      server.kill('SIGTERM');
      await Promise.race([
        new Promise((resolve) => server.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 5_000)),
      ]);
    }
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Admin E2E çalıştırılamadı.');
  process.exitCode = 1;
});
