import { readFile, writeFile } from 'node:fs/promises';
import { loadConfig, parseFixture } from './config.js';
import { runWorkload } from './runner.js';
import { localPerformance } from './local.js';

async function main(): Promise<void> {
  if (process.argv[2] === 'local') { await localPerformance(); return; }
  if (process.argv[2] !== 'workload') throw new Error('Expected local or workload.');
  const config = loadConfig(process.env);
  const fixture = parseFixture(JSON.parse(await readFile(process.env.PERF_FIXTURE_FILE ?? '/tmp/performance-fixture.json', 'utf8')) as unknown);
  const result = await runWorkload(config, fixture);
  await writeFile(process.env.PERF_RESULT_FILE ?? '/tmp/performance-result.json', JSON.stringify(result, null, 2));
  console.info(JSON.stringify({ profile: config.profile, users: config.users, passed: result.passed, violations: result.violations, requestsPerSecond: result.requestsPerSecond }));
  if (!result.passed) process.exitCode = 2;
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Performance operation failed.'); process.exitCode = 1; });
