import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { withinProbeDeadline } from '../../../../lib/probe-deadline.js';
const names = new Set(['axon_dr_probe_up', 'axon_dr_repository_up', 'axon_dr_backup_failure', 'axon_dr_backup_last_success_seconds', 'axon_dr_wal_age_seconds', 'axon_dr_archive_failure', 'axon_dr_archive_failures_total', 'axon_dr_archived_total', 'axon_dr_probe_timestamp_seconds']);
/** Accept numeric DR signals only, never arbitrary text, labels or file content. */
export function validatedDrMetrics(text: string): string {
  if (text.length > 16384)
    throw new Error('Oversized DR telemetry');
  const values = new Map<string, number>();
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('# TYPE '))
      continue;
    const parts = /^(axon_dr_[a-z_]+) ([0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)$/.exec(line);
    if (!parts || !names.has(parts[1]) || values.has(parts[1]))
      throw new Error('Invalid DR telemetry');
    const value = Number(parts[2]);
    if (!Number.isFinite(value) || value < 0)
      throw new Error('Invalid DR value');
    values.set(parts[1], value);
  }
  if (!values.has('axon_dr_probe_up') || ![0, 1].includes(values.get('axon_dr_probe_up') ?? -1))
    throw new Error('Missing DR probe state');
  if (values.get('axon_dr_probe_up') === 1) {
    for (const name of names)
      if (!values.has(name))
        throw new Error('Incomplete healthy DR telemetry');
    for (const name of ['axon_dr_repository_up', 'axon_dr_backup_failure', 'axon_dr_archive_failure'])
      if (![0, 1].includes(values.get(name) ?? -1))
        throw new Error('Invalid DR boolean');
  }
  return [...values].map(([name, value]) => `# TYPE ${name} ${name.endsWith('_total') ? 'counter' : 'gauge'}\n${name} ${value}`).join('\n') + '\n';
}
let pending: Promise<void> | undefined, cached = '', checkedAt = 0, healthy = false;
const unknown = '# TYPE axon_dr_probe_up gauge\naxon_dr_probe_up 0\n';
async function boundedRead(): Promise<string> {
  const file = await open('/run/axon-dr/metrics.prom', constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 16384)
      throw new Error('Invalid DR telemetry file');
    const buffer = Buffer.alloc(16385);
    const result = await file.read(buffer, 0, buffer.length, 0);
    if (result.bytesRead > 16384)
      throw new Error('Oversized DR telemetry');
    return buffer.subarray(0, result.bytesRead).toString('utf8');
  }
  finally {
    await file.close();
  }
}
export async function disasterRecoveryMetrics(): Promise<string> {
  if (!process.env.DR_METRICS_FILE)
    return '';
  if (process.env.DR_METRICS_FILE !== '/run/axon-dr/metrics.prom')
    return unknown;
  if (!pending && Date.now() - checkedAt >= 15000) {
    checkedAt = Date.now();
    const started = Date.now();
    pending = boundedRead().then(text => { cached = validatedDrMetrics(text); healthy = Date.now() - started <= 300; }, () => { healthy = false; }).catch(() => { healthy = false; }).finally(() => { pending = undefined; });
  }
  if (pending)
    await withinProbeDeadline(pending, 300).catch(() => { healthy = false; });
  return healthy ? cached : unknown;
}
