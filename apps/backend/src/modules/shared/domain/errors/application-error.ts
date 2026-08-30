import type { ApiErrorCode } from '@repo/types/contracts';

export type ErrorCategory = 'validation' | 'authorization' | 'conflict' | 'not-found' | 'state-transition' | 'external-provider' | 'rate-limit' | 'internal';
export type ErrorDetails = unknown;

export class ApplicationError extends Error {
  constructor(
    message: string,
    readonly category: ErrorCategory,
    readonly code: ApiErrorCode,
    readonly details?: ErrorDetails,
    readonly fields?: Readonly<Record<string, string>>,
    readonly operational = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConflictError extends ApplicationError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, 'conflict', 'CONFLICT', details);
  }
}

export class StateTransitionError extends ApplicationError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, 'state-transition', 'STATE_TRANSITION_ERROR', details);
  }
}

export class ExternalProviderError extends ApplicationError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, 'external-provider', 'EXTERNAL_PROVIDER_ERROR', details);
  }
}
