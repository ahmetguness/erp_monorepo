export const MAX_OUTBOX_ATTEMPTS = 5;
const INITIAL_DELAY_MS = 5_000;
const MAX_DELAY_MS = 15 * 60_000;

export class PermanentDeliveryError extends Error {
  override readonly name = 'PermanentDeliveryError';
}

export class IncompatibleEventError extends Error {
  override readonly name = 'IncompatibleEventError';
}

export class LostOutboxLeaseError extends Error {
  override readonly name = 'LostOutboxLeaseError';
}

/** Equal jitter avoids synchronized retries while retaining a positive lower bound. */
export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(MAX_DELAY_MS, INITIAL_DELAY_MS * 2 ** Math.min(20, Math.max(0, attempt - 1)));
  const sample = Math.min(1, Math.max(0, random()));
  return Math.floor(ceiling / 2 + sample * ceiling / 2);
}
