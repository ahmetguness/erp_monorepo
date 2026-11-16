import { AsyncLocalStorage } from 'node:async_hooks';

const deadlines = new AsyncLocalStorage<AbortSignal>();
export function providerRequestSignal(): AbortSignal | undefined { return deadlines.getStore(); }

/** Every request, backoff and polling sleep shares the job deadline; no detached Promise.race work. */
export async function runWithProviderDeadline<T>(timeoutMs: number, operation: () => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('Provider job deadline exceeded.')), timeoutMs);
  try { return await deadlines.run(controller.signal, operation); }
  finally { clearTimeout(timeout); }
}
