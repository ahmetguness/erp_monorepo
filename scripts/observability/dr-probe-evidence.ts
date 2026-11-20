import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { DrillCluster } from '../disaster-recovery/cluster.js';
import { docker, run } from '../disaster-recovery/process.js';
import { until } from './evidence.js';
/** Proves the deployable scheduler attempt-state and read-only collector. */
export async function proveDrFilePipeline(cluster: DrillCluster): Promise<void> {
  await cluster.assertOwned('container', cluster.source);
  const env = ['-e', 'DR_METRICS_DIRECTORY=/tmp/phase10-dr-metrics', '-e', 'PGDATABASE=phase3_dr_ci'];
  await docker(['exec', '-u', 'postgres', cluster.source, 'mkdir', '-p', '/tmp/phase10-dr-metrics']);
  const loop = run('docker', ['exec', '-u', 'postgres', ...env, cluster.source, 'sh', '-ec', 'echo $$ > /tmp/phase10-backup-loop.pid; exec dr-backup-loop']);
  try {
    await until('real backup scheduler completion state', async () => {
      const result = await run('docker', ['exec', cluster.source, 'cat', '/tmp/phase10-dr-metrics/backup-attempt.prom']);
      return result.code === 0 && /^axon_dr_backup_attempt_failed 0$/m.test(result.stdout);
    });
  }
  finally {
    await docker(['exec', cluster.source, 'sh', '-ec', 'kill -TERM "$(cat /tmp/phase10-backup-loop.pid)"']);
  }
  const finished = await loop;
  if (finished.code !== 0)
    throw new Error('Real backup scheduler did not stop safely');
  await writeFile(resolve(cluster.directory, 'phase10-backup-scheduler.log'), finished.stdout + '\n' + finished.stderr);
  await docker(['exec', '-u', 'postgres', ...env, cluster.source, 'dr-metrics']);
  const metrics = await docker(['exec', cluster.source, 'cat', '/tmp/phase10-dr-metrics/metrics.prom']);
  for (const evidence of ['axon_dr_probe_up 1', 'axon_dr_backup_failure 0', 'axon_dr_repository_up 1'])
    if (!metrics.includes(evidence))
      throw new Error('Actual DR collector evidence missing');
  await writeFile(resolve(cluster.directory, 'phase10-dr-file-pipeline.prom'), metrics);
}
export async function realBackupAttempt(cluster: DrillCluster, label: string): Promise<boolean> {
  await cluster.assertOwned('container', cluster.source);
  if (!/^[a-z-]+$/.test(label))
    throw new Error('Invalid backup evidence label');
  const result = await run('docker', ['exec', '-u', 'postgres', '-e', 'DR_METRICS_DIRECTORY=/tmp/phase10-dr-metrics', '-e', 'DR_BACKUP_ONCE=true', cluster.source, 'dr-backup-loop']);
  await writeFile(resolve(cluster.directory, 'phase10-backup-' + label + '.log'), result.stdout + '\n' + result.stderr);
  const state = await docker(['exec', cluster.source, 'cat', '/tmp/phase10-dr-metrics/backup-attempt.prom']);
  if (!state.includes(`axon_dr_backup_attempt_failed ${result.code === 0 ? 0 : 1}`))
    throw new Error('Backup attempt-state did not match actual command outcome');
  return result.code === 0;
}
