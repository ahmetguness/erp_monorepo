import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { LatencyHistogram } from '../statistics.js';
import { loadConfig, parseFixture } from '../config.js';
import { Measurements, containsForeignTenant } from '../measurements.js';
import { parsePricing, tenantCost } from '../cost.js';
import { WorkloadHTTP } from '../http.js';
import { MeasurementContinuity } from '../continuity.js';

test('sustained measurements reject long execution stalls even when percentiles hide them', () => {
  const measurement = new MeasurementContinuity(0, 1000);
  measurement.sample(10_000, 11_000);
  assert.equal(measurement.valid, true);
  measurement.sample(50_000, 51_000);
  assert.equal(measurement.valid, false);
  assert.equal(measurement.maximumGapMs, 40_000);
});
test('host suspension is detected when the VM monotonic clock pauses', () => {
  const measurement = new MeasurementContinuity(0, 1000);
  measurement.sample(10_000, 11_000);
  measurement.sample(20_000, 3_611_000);
  assert.equal(measurement.valid, false);
});

const actors = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'].map((plan, index) => ({ tenantId: `tenant-${index}`, plan, userId: `user-${index}`, token: 'synthetic-token', contactId: 'contact', productId: `product-${index}`, warehouseId: 'warehouse', cashAccountId: 'cash', taxRateId: 'tax', conversationId: 'conversation' }));
const fixture = () => parseFixture({ schemaVersion: 1, runId: 'phase8-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', actors });
test('stage selection preserves the specified VU counts and rejects malformed or credential-bearing targets', () => {
  assert.equal(loadConfig({ PERF_ORIGIN: 'https://isolated.test', PERF_STAGE: 'target' }).users, 1750);
  assert.equal(loadConfig({ PERF_ORIGIN: 'https://isolated.test', PERF_STAGE: 'stress' }).users, 2500);
  assert.equal(loadConfig({ PERF_ORIGIN: 'https://isolated.test', PERF_PROFILE: 'soak' }).seconds, 1800);
  for (const override of [{ PERF_STAGE: 'production' }, { PERF_SECONDS: 'NaN' }, { PERF_THINK_MS: '0' }, { PERF_ORIGIN: 'https://user:secret@isolated.test' }, { PERF_ORIGIN: 'https://isolated.test/token?secret=true' }]) assert.throws(() => loadConfig({ PERF_ORIGIN: 'https://isolated.test', ...override }));
});
test('fixture validation rejects duplicate tenants, missing plans and production identities', () => {
  assert.equal(fixture().actors.length, 3);
  assert.throws(() => parseFixture({ ...fixture(), actors: [actors[0], actors[0], actors[2]] }));
  assert.throws(() => parseFixture({ ...fixture(), runId: 'production' }));
});
test('bounded histograms use nearest rank and never understate overflow latency', () => {
  const histogram = new LatencyHistogram();
  for (let value = 1; value <= 100; value++) histogram.record(value);
  assert.deepEqual(histogram.summary(), { count: 100, p50Ms: 50, p95Ms: 95, p99Ms: 99, maxMs: 100, totalMs: 5050 });
  const overflow = new LatencyHistogram(); overflow.record(90_000); assert.equal(overflow.summary().p95Ms, 90_000);
  assert.throws(() => histogram.record(NaN)); assert.throws(() => histogram.record(-1));
});
test('warmup and post-window requests cannot inflate measured throughput', () => {
  const metrics = new Measurements(100, 200);
  for (const at of [50, 100, 150, 200, 250]) metrics.record('read', 'read', 'tenant', at, 12, 200, 20, true);
  assert.equal(metrics.snapshot().endpoints.read.requests, 2);
});
test('429s, expected denials, transport failures and 5xx remain distinct', () => {
  const metrics = new Measurements(0);
  for (const [status, expected] of [[200, true], [429, false], [404, true], [500, false], [0, false]] as const) metrics.record('api', 'read', 'tenant', 1, 10, status, 20, expected);
  const result = metrics.snapshot().endpoints.api;
  assert.equal(result.failed, 3); assert.equal(result.rateLimited, 1); assert.equal(result.serverErrors, 1); assert.equal(result.transportErrors, 1); assert.equal(result.expectedRejections, 1);
});
test('nested and array tenant identifiers are checked without relying on DTO shape', () => {
  assert.equal(containsForeignTenant({ data: [{ nested: { tenantId: 'foreign' } }] }, 'own'), true);
  assert.equal(containsForeignTenant({ data: [{ tenantId: 'own' }] }, 'own'), false);
});
test('cost separates fixed monthly allocation and observed usage with exact GiB and million-token units', () => {
  const pricing = parsePricing({ source: 'Illustrative fixture', currency: 'USD', monthlyInfrastructure: 90, storageGiBMonth: 2, egressGiB: 3, aiInputMillion: 4, aiOutputMillion: 8, externalCall: 0.5 });
  const result = tenantCost({ tenantId: 'tenant', plan: 'STARTER', storageBytes: 2 ** 30, downloadedBytes: 2 ** 30, inputTokens: 1_000_000, outputTokens: 2_000_000, externalCalls: 2 }, 3, pricing);
  assert.equal(result.monthlyFixedShare, 30); assert.equal(result.monthlyStoredData, 2); assert.equal(result.observedEgress, 3); assert.equal(result.observedAI, 20); assert.equal(result.observedExternal, 1);
  assert.throws(() => tenantCost({ tenantId: 'tenant', plan: 'STARTER', storageBytes: -1, downloadedBytes: 0, inputTokens: 0, outputTokens: 0, externalCalls: 0 }, 3, pricing));
});
test('a successful foreign-resource response without tenantId is still an isolation violation', async () => {
  const server = createServer((_request, response) => { response.setHeader('content-type', 'application/json'); response.end('{"data":{"id":"foreign"}}'); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Expected an owned HTTP test port.');
    const metrics = new Measurements(0); const config = loadConfig({ PERF_ORIGIN: `http://127.0.0.1:${address.port}` });
    await assert.rejects(new WorkloadHTTP(config, metrics).request(fixture().actors[0], 1, 'boundary', '/foreign', 'invariant', {}, [404]));
    assert.equal(metrics.violations, 1); assert.equal(metrics.snapshot().endpoints.boundary.failed, 1);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});
