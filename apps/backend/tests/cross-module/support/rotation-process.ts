import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
interface RotationCase {
  label: string;
  path: '/api/products' | '/api/admin/auth/me';
  token: string;
  expectedStatus: 200 | 401;
}
export async function verifyRotatedHttpProcess(jwt: string, admin: string, cases: RotationCase[]): Promise<void> {
  const result = await new Promise<{
    code: number | null;
    output: string;
  }>((resolveResult, reject) => {
    const shim = pathToFileURL(resolve('../../scripts/node26-tsx-shim.mjs')).href;
    const child = spawn(process.execPath, ['--import', shim, '--import', 'tsx', 'scripts/observability/rotation-http-probe.ts'], { windowsHide: true, env: { ...process.env, JWT_SECRET: jwt, ADMIN_JWT_SECRET: admin, REDIS_URL: '', LOG_FORMAT: 'json' }, stdio: ['pipe', 'pipe', 'pipe'], signal: AbortSignal.timeout(15000) });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { output = (output + chunk.toString('utf8')).slice(-100000); });
    child.stderr.resume();
    child.stdin.on('error', () => undefined);
    child.once('error', () => reject(new Error('Owned rotation process failed')));
    child.once('close', code => resolveResult({ code, output }));
    child.stdin.end(JSON.stringify(cases));
  });
  const encoded = result.output.split('\n').find(line => line.startsWith('AXON_ROTATION_RESULT='))?.slice('AXON_ROTATION_RESULT='.length);
  const results = z.array(z.object({ label: z.string(), status: z.number(), expected: z.number() })).length(cases.length).parse(encoded ? JSON.parse(encoded) : undefined);
  if (result.code !== 0 || results.some(row => row.status !== row.expected))
    throw new Error('Actual restarted HTTP process failed JWT/admin rotation validation');
}
