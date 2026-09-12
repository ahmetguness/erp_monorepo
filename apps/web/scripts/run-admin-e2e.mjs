import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const port = 3100;
const managedBaseUrl = `http://127.0.0.1:${port}`;
const webRoot = process.cwd();
const nextCli = path.resolve(webRoot, '../../node_modules/next/dist/bin/next');
const playwrightCli = path.resolve(webRoot, '../../node_modules/@playwright/test/cli.js');

async function available(baseUrl) {
  try { return (await fetch(`${baseUrl}/admin/login`)).ok; } catch { return false; }
}

async function findExistingServer() {
  const configuredBaseUrl = process.env.ADMIN_E2E_BASE_URL;
  if (configuredBaseUrl && await available(configuredBaseUrl)) return configuredBaseUrl;
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
  const server = ownsServer
    ? spawn(process.execPath, [nextCli, 'dev', '--hostname', '127.0.0.1', '--port', `${port}`], {
        cwd: webRoot,
        stdio: 'inherit',
        env: { ...process.env, NEXT_DIST_DIR: '.next-e2e' },
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
    if (server) server.kill('SIGTERM');
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Admin E2E çalıştırılamadı.');
  process.exitCode = 1;
});
