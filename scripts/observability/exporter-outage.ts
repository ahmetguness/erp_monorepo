import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { PerformanceActor } from '../../packages/types/src/performance.js';
import type { DrillCluster } from '../disaster-recovery/cluster.js';
import type { OperationalStack } from './stack.js';
import { docker } from '../disaster-recovery/process.js';
import { until } from './evidence.js';

/** Real collector outage: diagnostic loss must not roll back a payment or duplicate it. */
export async function proveExporterOutage(cluster: DrillCluster, stack: OperationalStack, origin: string, actor: PerformanceActor, metricsToken: string): Promise<void> {
  const counters = async () => {
    const response = await fetch(origin + '/metrics', { headers: { authorization: 'Bearer ' + metricsToken }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Exporter outage metrics unavailable');
    const text = await response.text();
    const read = (name: string) => {
      const value = new RegExp('^' + name + ' ([0-9]+)$', 'm').exec(text)?.[1];
      if (value === undefined) throw new Error('Missing exporter counter: ' + name);
      return Number(value);
    };
    return { traces: read('axon_telemetry_export_failures_total'), logs: read('axon_log_export_failures_total') };
  };
  const names = (await docker(['ps', '--filter', 'label=com.axon.observability=' + stack.project, '--format', '{{.Names}}'])).split('\n').filter(name => name === stack.project + '-tempo-1' || name === stack.project + '-loki-1');
  if (names.length !== 2) throw new Error('Owned telemetry services missing');
  const before = await counters();
  const body = { contactId: actor.contactId, cashAccountId: actor.cashAccountId, date: new Date().toISOString().slice(0, 10), amount: 17, direction: 'RECEIVE', method: 'CASH', idempotencyKey: 'phase10-exporter-' + randomUUID() };
  const ids: string[] = [];
  try {
    for (const name of names) await docker(['pause', name]);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(origin + '/api/payments', { method: 'POST', headers: { authorization: 'Bearer ' + actor.token, origin: 'http://127.0.0.1:3100', 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Payment failed during actual collector outage');
      ids.push(z.object({ data: z.object({ id: z.string().min(1) }) }).parse(await response.json()).data.id);
    }
    if (ids[0] !== ids[1]) throw new Error('Payment replay duplicated its financial effect');
    await until('actual trace and log exporter failures without business failure', async () => { const after = await counters(); return after.traces > before.traces && after.logs > before.logs; }, 30);
    await writeFile(resolve(cluster.directory, 'phase10-exporter-outage.json'), JSON.stringify({ before, during: await counters(), actualServicesPaused: names, paymentSucceeded: true, replaySamePayment: true, localOnly: true }, null, 2));
  } finally {
    for (const name of names) await docker(['unpause', name]);
  }
}
