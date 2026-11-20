import { test } from 'node:test';
import assert from 'node:assert/strict';
import { command } from '../process.js';

test('structured command output preserves complete JSON beyond the diagnostic tail budget', async () => {
  const output = await command(process.execPath, ['-e', "process.stdout.write(JSON.stringify({payload:'x'.repeat(1100000)}))"], process.env, { outputLimit: 2_000_000, failOnTruncation: true });
  const parsed: unknown = JSON.parse(output);
  if (!parsed || typeof parsed !== 'object' || !('payload' in parsed) || typeof parsed.payload !== 'string') throw new Error('Complete structured output required');
  assert.equal(parsed.payload.length, 1_100_000);
});

test('structured output overflow fails without exposing a partial private payload', async () => {
  await assert.rejects(command(process.execPath, ['-e', "process.stdout.write('synthetic-private-'.repeat(200))"], process.env, { outputLimit: 100, failOnTruncation: true }), error => error instanceof Error && error.message === 'Command output exceeded its bounded structured-output budget.');
  assert.equal(await command(process.execPath, ['-e', "process.stdout.write('abcdef')"], process.env, { outputLimit: 3 }), 'def');
  await assert.rejects(command(process.execPath, ['-e', ''], process.env, { outputLimit: 4_000_001 }), /Invalid bounded/);
});

test('stream decoding preserves split UTF-8 characters in structured JSON', async () => {
  const script = "const b=Buffer.from(JSON.stringify({value:'İşçi'}));for(let i=0;i<b.length;i++)process.stdout.write(b.subarray(i,i+1));";
  const output = await command(process.execPath, ['-e', script], process.env, { failOnTruncation: true });
  assert.deepEqual(JSON.parse(output), { value: 'İşçi' });
});
