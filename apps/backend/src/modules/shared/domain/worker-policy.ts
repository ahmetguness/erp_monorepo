export interface WorkerRetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_WORKER_RETRY_POLICY: WorkerRetryPolicy = Object.freeze({
  maxAttempts: 5,
  initialDelayMs: 5_000,
  maxDelayMs: 15 * 60_000,
});

export function exponentialBackoffMs(attempt: number, policy: WorkerRetryPolicy = DEFAULT_WORKER_RETRY_POLICY): number {
  const exponent = Math.max(0, Math.trunc(attempt) - 1);
  return Math.min(policy.maxDelayMs, policy.initialDelayMs * (2 ** exponent));
}

export function nextRetryDate(attempt: number, now: Date, policy: WorkerRetryPolicy = DEFAULT_WORKER_RETRY_POLICY): Date {
  return new Date(now.getTime() + exponentialBackoffMs(attempt, policy));
}

export function hasAttemptsRemaining(attempt: number, policy: WorkerRetryPolicy = DEFAULT_WORKER_RETRY_POLICY): boolean {
  return attempt < policy.maxAttempts;
}
