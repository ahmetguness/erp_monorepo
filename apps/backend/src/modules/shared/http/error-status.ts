import type { ErrorCategory } from '../domain/errors/application-error.js';

export type ApiErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502;

const STATUS_BY_CATEGORY: Readonly<Record<ErrorCategory, ApiErrorStatus>> = {
  validation: 400,
  authorization: 403,
  conflict: 409,
  'not-found': 404,
  'state-transition': 422,
  'external-provider': 502,
  'rate-limit': 429,
  internal: 500,
};

export function errorStatus(category: ErrorCategory): ApiErrorStatus {
  return STATUS_BY_CATEGORY[category];
}
