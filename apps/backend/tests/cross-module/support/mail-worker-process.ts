import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

export async function processMailInSeparateWorker(): Promise<number> {
  const result = await new Promise<{ code: number | null; output: string }>((resolveResult, reject) => {
    const shim = pathToFileURL(resolve('../../scripts/node26-tsx-shim.mjs')).href;
    const child = spawn(process.execPath, ['--import', shim, '--import', 'tsx', 'tests/cross-module/support/mail-trace.worker.ts'], {
      windowsHide: true, env: { ...process.env, APP_ROLE: 'worker', CROSS_MODULE_MAIL_WORKER_PROBE: 'true', REDIS_URL: '', LOG_FORMAT: 'json' },
      stdio: ['ignore', 'pipe', 'pipe'], signal: AbortSignal.timeout(15000),
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { output = (output + chunk.toString('utf8')).slice(-100000); });
    child.stderr.resume();
    child.once('error', () => reject(new Error('Owned mail worker process failed')));
    child.once('close', code => resolveResult({ code, output }));
  });
  const encoded = result.output.split('\n').find(line => line.startsWith('AXON_MAIL_WORKER_RESULT='))?.slice('AXON_MAIL_WORKER_RESULT='.length);
  const batch = z.object({ processId: z.number().int().positive(), batch: z.object({ claimed: z.number().int().positive(), failed: z.literal(0) }) }).safeParse(encoded ? JSON.parse(encoded) : undefined);
  if (result.code !== 0 || !batch.success) throw new Error('Actual separate-process mail delivery or trace flush failed');
  return batch.data.processId;
}
