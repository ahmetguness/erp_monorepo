import { setTimeout as pause } from 'node:timers/promises';
import { z } from 'zod';
import { docker } from '../disaster-recovery/process.js';
export class StartupFailure extends Error {
}
export async function until(label: string, check: () => Promise<boolean>, seconds = 150): Promise<void> {
  const end = Date.now() + seconds * 1000;
  do {
    try {
      if (await check())
        return;
    }
    catch (error) {
      if (error instanceof StartupFailure)
        throw error;
    }
    await pause(2000);
  } while (Date.now() < end);
  throw new Error(`Operational drill evidence missing: ${label}`);
}
export const notificationSchema = z.array(z.object({ name: z.string(), status: z.enum(['firing', 'resolved']), at: z.string(), severity: z.string(), service: z.string() }));
export const querySchema = z.object({ status: z.literal('success'), data: z.object({ result: z.array(z.unknown()) }) });
export function internalQuery(sink: string) {
  return async (url: string): Promise<unknown> => {
    const value = await docker(['exec', sink, 'node', '-e', `fetch(${JSON.stringify(url)},{headers:{accept:'application/json'},signal:AbortSignal.timeout(5000)}).then(async r=>{if(!r.ok)process.exit(2);process.stdout.write(await r.text())}).catch(()=>process.exit(3))`]);
    return JSON.parse(value);
  };
}
