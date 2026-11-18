import { object, number, string } from './validation.js';
import { parsePricing, tenantCost } from './cost.js';

export function renderReport(value: unknown, finalSnapshot: unknown, pricingValue: unknown): string {
  if (!Array.isArray(value)) throw new Error('Expected workload results.');
  const rows = value.map((entry: unknown) => {
    const row = object(entry); const config = object(row.config); const endpoints = Object.values(object(row.endpoints)).map(object);
    const maximumP95 = (kind: string) => {
      const latencies = endpoints.filter((endpoint) => endpoint.kind === kind).map((endpoint) => number(object(endpoint.latency).p95Ms));
      return latencies.length ? String(Math.max(...latencies)) : 'n/a';
    };
    const errors = endpoints.reduce((sum, endpoint) => sum + number(endpoint.serverErrors) + number(endpoint.transportErrors), 0);
    const throttled = endpoints.reduce((sum, endpoint) => sum + number(endpoint.rateLimited), 0);
    return `| ${string(config.profile)} | ${number(config.users)} | ${number(config.seconds)} | ${row.generatorFailure ? 'n/a' : number(row.requestsPerSecond).toFixed(1)} | ${maximumP95('read')} | ${maximumP95('write')} | ${row.measurementValid === true ? 'valid' : 'invalid'} | ${errors} | ${throttled} | ${row.queueHealthy === true ? 'PASS' : 'FAIL'} | ${row.passed === true ? 'PASS' : 'FAIL'} |`;
  });
  const snapshot = object(finalSnapshot); const tenants = snapshot.tenants;
  if (!Array.isArray(tenants)) throw new Error('Expected measured tenant consumption.');
  const pricing = parsePricing(pricingValue);
  const costs = tenants.map((value: unknown) => {
    const row = object(value);
    const cost = tenantCost({ tenantId: string(row.tenantId), plan: string(row.plan), storageBytes: number(row.storageBytes), downloadedBytes: number(row.downloadedBytes), inputTokens: number(row.inputTokens), outputTokens: number(row.outputTokens), externalCalls: 0 }, tenants.length, pricing);
    return `| ${cost.tenantId} | ${cost.plan} | ${number(row.storageBytes)} | ${number(row.downloadedBytes)} | ${cost.monthlyFixedShare.toFixed(2)} | ${cost.monthlyStoredData.toFixed(6)} | ${cost.observedEgress.toFixed(6)} | ${cost.observedAI.toFixed(6)} |`;
  });
  return `# Phase 8 local performance evidence\n\nSynthetic data; isolated local Docker only. Results do not establish production capacity or monthly availability.\n\nClosed-loop virtual users, 1 request journey at a time per VU, with configured think time; JSON files contain exact ramp, duration and generator metrics. Failed requests and rate limits are retained.\n\n| Profile | VUs | Measured seconds | HTTP requests/s | Worst read p95 ms | Worst write p95 ms | Generator | 5xx/transport | 429 | Queue | SLO |\n|---|---:|---:|---:|---:|---:|---|---:|---:|---|---|\n${rows.join('\n')}\n\n## Measured tenant consumption and illustrative cost\n\nPricing source: ${pricing.source} Currency: ${pricing.currency}. Fixed infrastructure is split equally among the synthetic tenants. Stored data is a monthly holding cost; egress and AI are only the observed run usage. Values are illustrative inputs, not a provider quote. External paid providers are disabled in this local fixture. No monthly traffic extrapolation is made.\n\n| Synthetic tenant | Plan | Stored bytes | Downloaded bytes | Monthly fixed share | Monthly storage | Observed egress | Observed AI |\n|---|---|---:|---:|---:|---:|---:|---:|\n${costs.join('\n')}\n`;
}
