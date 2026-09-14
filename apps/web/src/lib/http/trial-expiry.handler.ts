import type { ApiError } from '@repo/types/contracts';

export const TRIAL_EXPIRED_CODE = 'TRIAL_EXPIRED';
export const TRIAL_EXPIRED_MESSAGE = 'Demo süreniz doldu. İşlem yapmak için tam sürüme geçin.';

export function isTrialExpiredError(error: ApiError): boolean {
  return error.error.code === TRIAL_EXPIRED_CODE;
}
