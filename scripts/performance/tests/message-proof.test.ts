import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { MessageProof } from '../message-proof.js';
import { performanceBudget } from '../budget.js';
import { queueHealthy } from '../queue.js';
import { command, commandResult } from '../../release/process.js';

test('delivery proof requires every connected recipient and handles receipts before HTTP acceptance', () => {
  const proof = new MessageProof();
  proof.connect(1, 'tenant', 'room'); proof.connect(2, 'tenant', 'room'); proof.connect(3, 'foreign', 'room');
  proof.begin('message', 'tenant', 'room');
  assert.equal(proof.observe(3, 'message'), false);
  assert.equal(proof.observe(1, 'message'), true);
  assert.equal(proof.observe(1, 'message'), false);
  proof.accept('message');
  assert.equal(proof.snapshot().unconfirmedReceipts, 1);
  proof.disconnect(2);
  assert.equal(proof.snapshot().unconfirmedReceipts, 1);
  assert.equal(proof.observe(2, 'message'), true);
  assert.deepEqual(proof.snapshot(), { acceptedMessages: 1, expectedReceipts: 2, confirmedReceipts: 2, unconfirmedReceipts: 0, trackingOverflows: 0 });
});

test('rejected sends are excluded and bounded tracking overflows remain visible', () => {
  const proof = new MessageProof(); proof.connect(1, 'tenant', 'room');
  proof.begin('rejected', 'tenant', 'room'); proof.observe(1, 'rejected'); proof.cancel('rejected');
  assert.equal(proof.snapshot().acceptedMessages, 0);
  for (let i = 0; i <= 10_000; i++) proof.begin(String(i), 'tenant', 'room');
  assert.equal(proof.snapshot().trackingOverflows, 1);
});

test('resource experiments preserve original defaults and reject unbounded pool and CPU settings', () => {
  assert.equal(performanceBudget({}).apiPool, 5);
  assert.equal(performanceBudget({}).proxyCpu, 0.5);
  for (const env of [{ PERF_API_POOL: '100' }, { PERF_WORKER_CPU: '0' }, { PERF_GENERATOR_CPU: 'Infinity' }]) assert.throws(() => performanceBudget(env));
});

test('queue health rejects failed, dead-letter or over-age work even if a later sample drains', () => {
  assert.equal(queueHealthy({ failed: 0, deadLetter: 0, oldestSeconds: 30 }), true);
  for (const row of [{ failed: 1, deadLetter: 0, oldestSeconds: 0 }, { failed: 0, deadLetter: 1, oldestSeconds: 0 }, { failed: 0, deadLetter: 0, oldestSeconds: 31 }, { failed: 0, deadLetter: 0, oldestSeconds: NaN }]) assert.equal(queueHealthy(row), false);
});

test('failed assurance commands retain structured evidence while strict command callers still reject', async () => {
  const code = 'process.stdout.write(JSON.stringify({passed:false}));process.exitCode=1;';
  const result = await commandResult(process.execPath, ['-e', code]);
  const evidence: unknown = JSON.parse(result.output);
  assert.equal(result.exitCode, 1); assert.deepEqual(evidence, { passed: false });
  await assert.rejects(command(process.execPath, ['-e', code]), /exit code 1/);
});
