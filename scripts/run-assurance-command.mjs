import { spawn } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function xml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

const separator = process.argv.indexOf('--');
if (separator < 0 || separator === process.argv.length - 1) {
  throw new Error('Usage: node scripts/run-assurance-command.mjs <suite> <output-dir> -- <command> [args...]');
}

const suite = process.argv[2];
const reportName = process.env.INTEGRATION_SUITE ? `${suite}-${process.env.INTEGRATION_SUITE}` : suite;
if (!/^[a-zA-Z0-9_-]+$/.test(reportName)) throw new Error('Suite names must contain only letters, digits, underscores and hyphens.');
const outputDir = path.resolve(process.argv[3]);
const [command, ...args] = process.argv.slice(separator + 1);
// npm.cmd cannot be spawned directly without a shell on Windows. Invoke npm's
// JavaScript entry point so arguments retain their literal values.
const npmCli = process.env.npm_execpath;
const useNpmCli = command === 'npm' && npmCli;
const executable = useNpmCli ? process.execPath : command;
const commandArgs = useNpmCli ? [npmCli, ...args] : args;
const startedAt = new Date();
const timeoutMs = Number.parseInt(process.env.ASSURANCE_TIMEOUT_MS ?? '1200000', 10);
if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('ASSURANCE_TIMEOUT_MS must be a positive integer.');

const child = spawn(executable, commandArgs, {
  cwd: process.cwd(), env: process.env, stdio: 'inherit',
  detached: process.platform !== 'win32', windowsHide: true,
});
let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  if (!child.pid) return;
  if (process.platform === 'win32') {
    // npm launches a shell and then Node; stopping just npm leaves the test
    // process alive. Stop the owned process tree on timeout.
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    const fallback = setTimeout(() => {
      killer.kill();
      child.kill('SIGKILL');
    }, 1_000);
    killer.once('error', () => { clearTimeout(fallback); child.kill('SIGKILL'); });
    killer.once('exit', (code) => {
      clearTimeout(fallback);
      if (code !== 0) child.kill('SIGKILL');
    });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  }
}, timeoutMs);
const processResult = await new Promise((resolve) => {
  child.once('error', (error) => resolve({ exitCode: 1, spawnError: error.message }));
  child.once('exit', (code) => resolve({ exitCode: code ?? 1, spawnError: null }));
}).finally(() => clearTimeout(timer));

const finishedAt = new Date();
const status = processResult.exitCode === 0 && !timedOut ? 'passed' : 'failed';
const migrationDir = new URL('../apps/backend/prisma/schema/migrations/', import.meta.url);
const migrations = (await readdir(migrationDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const report = {
  suite,
  status,
  exitCode: processResult.exitCode,
  timedOut,
  spawnError: processResult.spawnError,
  durationMs: finishedAt.getTime() - startedAt.getTime(),
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  runId: process.env.CI_RUN_ID ?? 'local',
  commitSha: process.env.GITHUB_SHA ?? 'local',
  integrationSuite: process.env.INTEGRATION_SUITE ?? 'all',
  migrationVersion: migrations.at(-1) ?? null,
  migrationCount: migrations.length,
  environment: { node: process.version, platform: process.platform, ci: Boolean(process.env.CI) },
  fixture: { strategy: 'CI_RUN_ID + timestamp + UUID; tenant-scoped cleanup', seed: 'prisma/seed.ts' },
  command: [command, ...args],
};

await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, `${reportName}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const message = processResult.spawnError ?? (timedOut ? `Timed out after ${timeoutMs}ms` : `Exited with ${processResult.exitCode}`);
const failure = status === 'failed' ? `<failure message="${xml(message)}"/>` : '';
const seconds = report.durationMs / 1000;
const junit = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${xml(suite)}" tests="1" failures="${status === 'failed' ? 1 : 0}" time="${seconds}"><testcase classname="assurance" name="${xml(suite)}" time="${seconds}">${failure}</testcase></testsuite>\n`;
await writeFile(path.join(outputDir, `${reportName}.junit.xml`), junit, 'utf8');
process.exitCode = status === 'passed' ? 0 : 1;
