import { randomBytes } from 'node:crypto';
import { getCurrentObservabilityContext, recordExternalRequest } from '../../../../services/observability.service.js';

function traceId(correlationId: string | undefined): string {
  const normalized = correlationId?.replaceAll('-', '').toLowerCase();
  return normalized && /^[a-f0-9]{32}$/.test(normalized) ? normalized : randomBytes(16).toString('hex');
}

export async function observedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? new URL(input.url) : new URL(input.toString());
  const context = getCurrentObservabilityContext();
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  if (!headers.has('traceparent')) {
    headers.set('traceparent', `00-${traceId(context?.correlationId)}-${randomBytes(8).toString('hex')}-01`);
  }
  if (context?.correlationId && !headers.has('x-correlation-id')) headers.set('x-correlation-id', context.correlationId);

  const startedAt = Date.now();
  try {
    const response = await fetch(input, { ...init, headers });
    recordExternalRequest({ service: url.host, durationMs: Date.now() - startedAt, outcome: response.ok ? 'success' : 'error' });
    return response;
  } catch (error) {
    recordExternalRequest({ service: url.host, durationMs: Date.now() - startedAt, outcome: 'error' });
    throw error;
  }
}
