import { ApiErrorSchema, type ApiError } from '@repo/types/contracts';
import type { MiddlewareHandler } from 'hono';
import { apiError } from './api-response.js';

interface LegacyErrorBody {
  error: string;
  code?: string;
  details?: unknown;
  fields?: Readonly<Record<string, string>>;
}

const DEFAULT_CODE_BY_STATUS: Readonly<Record<number, string>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'STATE_TRANSITION_ERROR',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  502: 'EXTERNAL_PROVIDER_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

function isLegacyErrorBody(value: unknown): value is LegacyErrorBody {
  return typeof value === 'object' && value !== null && 'error' in value
    && typeof value.error === 'string';
}

export function normalizeErrorBody(payload: unknown, status: number, requestId?: string): ApiError | null {
  const current = ApiErrorSchema.safeParse(payload);
  if (current.success) {
    return requestId && !current.data.error.requestId
      ? { error: { ...current.data.error, requestId } }
      : current.data;
  }
  if (!isLegacyErrorBody(payload)) return null;
  return apiError(payload.code ?? DEFAULT_CODE_BY_STATUS[status] ?? 'UNKNOWN_ERROR', payload.error, {
    details: payload.details,
    fields: payload.fields,
    requestId,
  });
}

export const enforceResponseContract: MiddlewareHandler = async (context, next) => {
  await next();
  if (context.res.status < 400 || !context.res.headers.get('content-type')?.includes('application/json')) return;

  const payload: unknown = await context.res.clone().json().catch(() => null);
  const requestId = context.res.headers.get('x-request-id') ?? undefined;
  const normalized = normalizeErrorBody(payload, context.res.status, requestId);
  if (!normalized) return;

  const headers = new Headers(context.res.headers);
  headers.delete('content-length');
  context.res = new Response(JSON.stringify(normalized), {
    status: context.res.status,
    statusText: context.res.statusText,
    headers,
  });
};
