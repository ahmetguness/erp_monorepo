import { Prisma } from '@prisma/client';
import type { Hono } from 'hono';
import { BaseError, ValidationError } from '../../errors/index.js';
import { logger } from '../../lib/logger.js';
import { recordUnhandledError } from '../../services/observability.service.js';

const UNIQUE_FIELD_LABELS: Readonly<Record<string, string>> = {
  taxNumber: 'Vergi numarası', email: 'E-posta', code: 'Kod', slug: 'Slug', iban: 'IBAN', number: 'Numara',
};

export function registerErrorHandlers(app: Hono, isProduction: boolean): void {
  app.onError((error, context) => {
    const requestId = context.res.headers.get('x-request-id') ?? context.req.header('x-request-id') ?? 'unknown';
    const correlationId = context.res.headers.get('x-correlation-id') ?? context.req.header('x-correlation-id') ?? requestId;
    recordUnhandledError({ method: context.req.method, path: context.req.path, message: error.message, requestId, correlationId });

    if (error instanceof BaseError && error.isOperational) {
      logger.warn(`Operational error: ${error.message}`, { requestId, correlationId });
      return context.json(error.toJSON(), error.statusCode as 400);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.filter((field): field is string => typeof field === 'string')
        : [];
      const fields = Object.fromEntries(target.map((field) => [field, `${UNIQUE_FIELD_LABELS[field] ?? field} zaten kullanımda.`]));
      const message = target.length === 1
        ? `${UNIQUE_FIELD_LABELS[target[0]] ?? target[0]} zaten kullanımda.`
        : 'Bu kayıt için benzersiz olması gereken bir alan zaten kullanımda.';
      const validationError = new ValidationError(message, Object.keys(fields).length > 0 ? fields : undefined);
      logger.warn(`Prisma unique constraint violation: ${target.join(', ') || 'unknown'}`, { requestId, correlationId });
      return context.json(validationError.toJSON(), 400);
    }

    logger.error(`Unhandled error: ${error.message}`, { requestId, correlationId });
    return context.json({
      error: {
        code: 'INTERNAL_ERROR',
        message: isProduction ? 'Beklenmeyen bir hata oluştu.' : error.message,
        ...(!isProduction && error.stack ? { stack: error.stack } : {}),
      },
    }, 500);
  });

  app.notFound((context) => context.json({ error: { code: 'NOT_FOUND', message: 'Endpoint bulunamadı.' } }, 404));
}
