import { getCurrentObservabilityContext, recordExternalRequest } from '../../services/observability.service.js';
import { traceparent } from './context.js';
import { withSpan } from './tracing.js';
import { observeTelemetry, countTelemetry } from './metrics.js';
function providerName(host: string): string {
  try {
    if (process.env.S3_ENDPOINT && new URL(process.env.S3_ENDPOINT).hostname === host)
      return 'storage';
  }
  catch { /* Invalid storage configuration is handled by its owner. */ }
  if (host === 'api.resend.com')
    return 'mail';
  if (host.endsWith('.trendyol.com'))
    return 'marketplace';
  if (host.endsWith('.amazonaws.com') || host.endsWith('.r2.cloudflarestorage.com'))
    return 'storage';
  if (host === 'localhost' || host === '127.0.0.1')
    return 'local-fixture';
  return 'external';
}
export async function observedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? new URL(input.url) : new URL(input.toString());
  const provider = providerName(url.hostname);
  const attributes: Record<string, string | number> = { 'provider.name': provider };
  return withSpan('provider.request', 3, attributes, async () => {
    const context = getCurrentObservabilityContext();
    // RequestInit replaces a Request's header set, even when the supplied set
    // is empty. Retaining old headers could forward obsolete credentials.
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const parent = traceparent();
    if (parent)
      headers.set('traceparent', parent);
    if (context?.correlationId && !headers.has('x-correlation-id'))
      headers.set('x-correlation-id', context.correlationId);
    const startedAt = Date.now();
    try {
      const response = await fetch(input, { ...init, headers });
      attributes['http.response.status_code'] = response.status;
      if (!response.ok)
        attributes['error.type'] = 'ProviderHttpError';
      recordExternalRequest({ service: provider, durationMs: Date.now() - startedAt, outcome: response.ok ? 'success' : 'error' });
      observeTelemetry('axon_provider_request_duration_seconds', (Date.now() - startedAt) / 1000, { provider, result: response.ok ? 'success' : 'error' });
      if (!response.ok)
        countTelemetry(response.status === 429 ? 'axon_provider_rate_limits_total' : response.status >= 500 ? 'axon_provider_server_errors_total' : 'axon_provider_client_errors_total');
      return response;
    }
    catch (error) {
      const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
      attributes['error.type'] = timeout ? 'TimeoutError' : 'ConnectionError';
      recordExternalRequest({ service: provider, durationMs: Date.now() - startedAt, outcome: 'error' });
      observeTelemetry('axon_provider_request_duration_seconds', (Date.now() - startedAt) / 1000, { provider, result: 'error' });
      if (timeout)
        countTelemetry('axon_provider_timeouts_total');
      countTelemetry('axon_provider_connection_failures_total');
      throw error;
    }
  });
}
