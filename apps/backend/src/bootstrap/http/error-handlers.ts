import type { Hono } from 'hono';
import { BaseError } from '../../errors/index.js';
import { logger } from '../../lib/logger.js';
import {
  apiError,
  errorResponse,
  errorStatus,
  mapPrismaError,
} from '../../modules/shared/index.js';
import { ApplicationError } from '../../modules/shared/domain/index.js';
import { recordUnhandledError } from '../../services/observability.service.js';

export function registerErrorHandlers(app: Hono, isProduction: boolean): void {
  app.onError((error, context) => {
    const requestId = context.res.headers.get('x-request-id') ?? context.req.header('x-request-id') ?? 'unknown';
    const correlationId = context.res.headers.get('x-correlation-id') ?? context.req.header('x-correlation-id') ?? requestId;
    recordUnhandledError({ method: context.req.method, path: context.req.path, message: error.message, requestId, correlationId });

    if (error instanceof ApplicationError && error.operational) {
      logger.warn(`Operational error: ${error.message}`, { requestId, correlationId });
      const status = error instanceof BaseError ? error.statusCode : errorStatus(error.category);
      return context.json(errorResponse(error, requestId), status as 400);
    }

    const persistenceError = mapPrismaError(error);
    if (persistenceError) {
      logger.warn(`Persistence error translated: ${persistenceError.code}`, { requestId, correlationId });
      return context.json(errorResponse(persistenceError, requestId), errorStatus(persistenceError.category));
    }

    logger.error(`Unhandled error: ${error.message}`, { requestId, correlationId });
    return context.json(apiError('INTERNAL_ERROR', isProduction ? 'Beklenmeyen bir hata oluştu.' : error.message, {
      ...(!isProduction && error.stack ? { details: { stack: error.stack } } : {}),
      requestId,
    }), 500);
  });

  app.notFound((context) => {
    const requestId = context.res.headers.get('x-request-id') ?? context.req.header('x-request-id');
    return context.json(apiError('NOT_FOUND', 'Endpoint bulunamadı.', { requestId }), 404);
  });
}
