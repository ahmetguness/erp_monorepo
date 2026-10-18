import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
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
const outputDir = path.resolve(process.argv[3]);
const [command, ...args] = process.argv.slice(separator + 1);
const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
const startedAt = new Date();
const timeoutMs = Number.parseInt(process.env.ASSURANCE_TIMEOUT_MS ?? '1200000', 10);
if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('ASSURANCE_TIMEOUT_MS must be a positive integer.');

const child = spawn(executable, args, { cwd: process.cwd(), env: process.env, stdio: 'inherit' });
let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  child.kill('SIGTERM');
}, timeoutMs);
const processResult = await new Promise((resolve) => {
  child.once('error', (error) => resolve({ exitCode: 1, spawnError: error.message }));
  child.once('exit', (code) => resolve({ exitCode: code ?? 1, spawnError: null }));
}).finally(() => clearTimeout(timer));

const finishedAt = new Date();
const status = processResult.exitCode === 0 && !timedOut ? 'passed' : 'failed';
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
  command: [command, ...args],
};

await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, `${suite}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const message = processResult.spawnError ?? (timedOut ? `Timed out after ${timeoutMs}ms` : `Exited with ${processResult.exitCode}`);
const failure = status === 'failed' ? `<failure message="${xml(message)}"/>` : '';
const seconds = report.durationMs / 1000;
const junit = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${xml(suite)}" tests="1" failures="${status === 'failed' ? 1 : 0}" time="${seconds}"><testcase classname="assurance" name="${xml(suite)}" time="${seconds}">${failure}</testcase></testsuite>\n`;
await writeFile(path.join(outputDir, `${suite}.junit.xml`), junit, 'utf8');
process.exitCode = status === 'passed' ? 0 : 1;
