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
import { matchedRoutes } from 'hono/route';

export function registerErrorHandlers(app: Hono, isProduction: boolean): void {
  app.onError((error, context) => {
    const requestId = context.res.headers.get('x-request-id') ?? context.req.header('x-request-id') ?? 'unknown';
    const correlationId = context.res.headers.get('x-correlation-id') ?? context.req.header('x-correlation-id') ?? requestId;
    const route = matchedRoutes(context).filter(row => row.method === context.req.method && !['*', '/*'].includes(row.path)).at(-1)?.path ?? 'unmatched';
    recordUnhandledError({ method: context.req.method, path: route, message: error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR', requestId, correlationId });

    if (error instanceof ApplicationError && error.operational) {
      logger.warn('Operational request failure', { errorCode: error.code, operation: 'http.request', requestId, correlationId });
      const status = error instanceof BaseError ? error.statusCode : errorStatus(error.category);
      const supported = [400, 401, 402, 403, 404, 405, 408, 409, 410, 412, 413, 415, 422, 423, 429, 500, 502, 503, 504] as const;
      return context.json(errorResponse(error, requestId), supported.find(value => value === status) ?? 500);
    }

    const persistenceError = mapPrismaError(error);
    if (persistenceError) {
      logger.warn(`Persistence error translated: ${persistenceError.code}`, { requestId, correlationId });
      return context.json(errorResponse(persistenceError, requestId), errorStatus(persistenceError.category));
    }

    logger.error('Unhandled request failure', { errorCode: 'INTERNAL_ERROR', operation: 'http.request', requestId, correlationId });
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
