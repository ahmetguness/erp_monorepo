import { LatencyHistogram } from './statistics.js';
import { MessageProof } from './message-proof.js';
export type RequestKind = 'read' | 'write' | 'web' | 'invariant';
interface Counter { kind: RequestKind; latency: LatencyHistogram; requests: number; failed: number; serverErrors: number; transportErrors: number; rateLimited: number; expectedRejections: number; bytes: number; statusCounts: Record<string, number> }
export class Measurements {
  private readonly endpoints = new Map<string, Counter>();
  private readonly tenants = new Map<string, { requests: number; bytes: number; totalMs: number }>();
  violations = 0;
  scenarioFailures = 0;
  inFlight = 0;
  maximumInFlight = 0;
  sockets = 0;
  maximumSockets = 0;
  socketFailures = 0;
  messages = 0;
  pings = 0;
  pongs = 0;
  readonly delivery = new LatencyHistogram();
  readonly verifiedDelivery = new LatencyHistogram();
  readonly messageProof = new MessageProof();
  constructor(readonly steadyAt: number, readonly endAt: number = Infinity) {}
  isMeasuring(at = performance.now()): boolean { return at >= this.steadyAt && at < this.endAt; }
  record(label: string, kind: RequestKind, tenantId: string, started: number, milliseconds: number, status: number, bytes: number, expected: boolean): void {
    if (!this.isMeasuring(started)) return;
    let metric = this.endpoints.get(label);
    if (!metric) { metric = { kind, latency: new LatencyHistogram(), requests: 0, failed: 0, serverErrors: 0, transportErrors: 0, rateLimited: 0, expectedRejections: 0, bytes: 0, statusCounts: {} }; this.endpoints.set(label, metric); }
    metric.latency.record(milliseconds); metric.requests++; metric.bytes += bytes;
    metric.statusCounts[String(status)] = (metric.statusCounts[String(status)] ?? 0) + 1;
    if (!expected) metric.failed++;
    if (status >= 500) metric.serverErrors++;
    if (status === 0) metric.transportErrors++;
    if (status === 429) metric.rateLimited++;
    if (expected && status >= 400) metric.expectedRejections++;
    const tenant = this.tenants.get(tenantId) ?? { requests: 0, bytes: 0, totalMs: 0 };
    tenant.requests++; tenant.bytes += bytes; tenant.totalMs += milliseconds; this.tenants.set(tenantId, tenant);
  }
  snapshot() {
    return { endpoints: Object.fromEntries([...this.endpoints].map(([label, value]) => [label, { ...value, latency: value.latency.summary() }])), tenants: Object.fromEntries(this.tenants), violations: this.violations, scenarioFailures: this.scenarioFailures, maximumInFlight: this.maximumInFlight, maximumSockets: this.maximumSockets, socketFailures: this.socketFailures, messages: this.messages, pings: this.pings, pongs: this.pongs, delivery: this.delivery.summary(), verifiedDelivery: this.verifiedDelivery.summary(), messageProof: this.messageProof.snapshot() };
  }
}
export function containsForeignTenant(value: unknown, tenantId: string): boolean {
  if (Array.isArray(value)) return value.some((entry: unknown) => containsForeignTenant(entry, tenantId));
  if (!value || typeof value !== 'object') return false;
  const object = value as Record<string, unknown>;
  if (typeof object.tenantId === 'string' && object.tenantId !== tenantId) return true;
  return Object.values(object).some((entry) => containsForeignTenant(entry, tenantId));
}
