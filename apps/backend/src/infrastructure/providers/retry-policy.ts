export class ProviderHttpError extends Error {
  override readonly name = 'ProviderHttpError';
  constructor(message: string, readonly statusCode: number, readonly retryAfterMs = 0, readonly errorCode?: string) { super(message); }
  get retryable(): boolean {
    return this.statusCode === 0 || this.statusCode === 408 || this.statusCode === 429 || this.statusCode >= 500
      || (this.statusCode === 409 && (this.errorCode === 'concurrent_idempotent_requests' || this.errorCode === 'resource_locked'));
  }
}

export function parseRetryAfter(value: string | null, now = Date.now()): number {
  if (!value) return 0;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.min(15 * 60_000, Math.max(0, delay)) : 0;
}

export function providerRetryDelay(attempt: number, retryAfterMs = 0, random: () => number = Math.random): number {
  const ceiling = Math.min(8_000, 1000 * 2 ** Math.min(10, Math.max(0, attempt - 1)));
  return Math.max(retryAfterMs, Math.floor(ceiling / 2 + Math.min(1, Math.max(0, random())) * ceiling / 2));
}
