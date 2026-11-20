const types = new Set(['Error', 'TypeError', 'RangeError', 'TimeoutError', 'AbortError', 'ValidationError', 'ZodError', 'ConflictError', 'ForbiddenError', 'NotFoundError', 'PrismaClientKnownRequestError', 'PrismaClientUnknownRequestError', 'PrismaClientInitializationError']);
/** No raw message, stack, cause, provider body, prompt or SQL parameters. */
export function diagnosticErrorFields(error: unknown): {
  errorType: string;
  errorCode: string;
} {
  const errorType = error instanceof Error && types.has(error.name) ? error.name : 'UnknownError';
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return { errorType, errorCode: typeof code === 'string' && /^P\d{4}$/.test(code) ? code : 'OPERATION_FAILED' };
}
