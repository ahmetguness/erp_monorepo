import type { PerformanceActor } from '../../packages/types/src/performance.js';
import type { LoadConfig } from './config.js';
import { containsForeignTenant, Measurements, type RequestKind } from './measurements.js';
import { object, string } from './validation.js';

export class ScenarioFailure extends Error {}
export class WorkloadHTTP {
  readonly failureSamples: Array<{ label: string; status: number; code: string; message: string; details: unknown }> = [];
  constructor(private readonly config: LoadConfig, readonly metrics: Measurements) {}
  async request(actor: PerformanceActor, vu: number, label: string, path: string, kind: RequestKind, init: RequestInit = {}, expected: readonly number[] = [200], raw = false): Promise<unknown> {
    const started = performance.now(); let status = 0; let bytes = 0; let body: unknown = null; let succeeded = false;
    this.metrics.inFlight++; this.metrics.maximumInFlight = Math.max(this.metrics.maximumInFlight, this.metrics.inFlight);
    try {
      const headers = new Headers(init.headers);
      headers.set('authorization', `Bearer ${actor.token}`); headers.set('cookie', `axon_token=${actor.token}`);
      headers.set('origin', 'https://phase8.example.test'); headers.set('host', 'phase8.example.test');
      headers.set('x-forwarded-for', `10.${Math.floor(vu / 65536)}.${Math.floor(vu / 256) % 256}.${vu % 256}`);
      const response = await fetch(`${this.config.origin}${path}`, { ...init, headers, signal: AbortSignal.timeout(this.config.requestTimeoutMs), redirect: 'error' });
      status = response.status;
      if (kind === 'invariant' && status >= 200 && status < 300 && expected.every((value) => value >= 400)) this.metrics.violations++;
      const buffer = await response.arrayBuffer(); bytes = buffer.byteLength;
      if (!raw && !bytes) {
        if (this.failureSamples.length < 10) this.failureSamples.push({ label, status, code: 'EMPTY_RESPONSE', message: 'Empty API response; verify target and proxy.', details: null });
        throw new ScenarioFailure('Empty API response; target routing must be verified.');
      }
      if (!raw && bytes) { try { body = JSON.parse(new TextDecoder().decode(buffer)) as unknown; } catch { throw new ScenarioFailure('Non-JSON API response.'); } }
      if (!raw && containsForeignTenant(body, actor.tenantId)) { this.metrics.violations++; throw new ScenarioFailure('Tenant boundary violation.'); }
      if (!expected.includes(status)) {
        if (this.failureSamples.length < 10) {
          const error = body && typeof body === 'object' && 'error' in body && body.error && typeof body.error === 'object' ? object(body.error) : {};
          this.failureSamples.push({ label, status, code: typeof error.code === 'string' ? error.code : 'UNKNOWN', message: typeof error.message === 'string' ? error.message.slice(0, 200) : 'Unexpected response', details: error.details ?? null });
        }
        throw new ScenarioFailure(`Unexpected HTTP ${status} for ${label}.`);
      }
      succeeded = true;
      return body;
    } finally {
      this.metrics.inFlight--;
      this.metrics.record(label, kind, actor.tenantId, started, performance.now() - started, status, bytes, succeeded);
    }
  }
  post(actor: PerformanceActor, vu: number, label: string, path: string, body: unknown, expected: readonly number[] = [201]): Promise<unknown> {
    return this.request(actor, vu, label, path, 'write', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, expected);
  }
}
export function entity(value: unknown): Record<string, unknown> { return object(object(value).data); }
export function entityId(value: unknown): string { return string(entity(value).id); }
