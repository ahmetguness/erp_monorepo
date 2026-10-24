import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const runner = fileURLToPath(new URL('../run-assurance-command.mjs', import.meta.url));

for (const scenario of [
  { name: 'success', code: 'process.exit(0)', status: 'passed', exitCode: 0 },
  { name: 'failure', code: 'process.exit(7)', status: 'failed', exitCode: 7 },
  { name: 'timeout', code: 'setTimeout(() => {}, 10000)', status: 'failed', timedOut: true },
  { name: 'spawn-error', command: 'missing-assurance-command-4e312', status: 'failed', exitCode: 1 },
]) {
  test(`assurance reports ${scenario.name} without losing failure status`, () => {
    const output = mkdtempSync(path.join(os.tmpdir(), 'assurance-'));
    try {
      const command = scenario.command ? [scenario.command] : [process.execPath, '-e', scenario.code];
      const result = spawnSync(process.execPath, [runner, 'fixture', output, '--', ...command], {
        env: { ...process.env, ASSURANCE_TIMEOUT_MS: scenario.timedOut ? '200' : '5000', INTEGRATION_SUITE: 'finance' },
        encoding: 'utf8', timeout: 10_000,
      });
      assert.equal(result.status, scenario.status === 'passed' ? 0 : 1, result.stderr);
      const report = JSON.parse(readFileSync(path.join(output, 'fixture-finance.json'), 'utf8'));
      assert.equal(report.status, scenario.status);
      assert.equal(report.timedOut, Boolean(scenario.timedOut));
      if (scenario.exitCode !== undefined) assert.equal(report.exitCode, scenario.exitCode);
      if (scenario.command) assert.ok(report.spawnError);
      assert.ok(report.migrationVersion);
      assert.ok(report.migrationCount > 0);
      assert.equal(report.integrationSuite, 'finance');
      const junit = readFileSync(path.join(output, 'fixture-finance.junit.xml'), 'utf8');
      assert.ok(junit.includes(`failures="${scenario.status === 'passed' ? 0 : 1}"`));
    } finally {
      assert.equal(path.dirname(path.resolve(output)), path.resolve(os.tmpdir()));
      rmSync(output, { recursive: true, force: true });
    }
  });
}
