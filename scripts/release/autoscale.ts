import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { atomicWrite, readState } from './state.js';
import { deployRelease, type DeployConfig } from './deploy.js';
import { command } from './process.js';

export interface ScalingPolicy { minimum: number; maximum: number; targetCpu: number }
export function chooseReplicas(current: number, cpu: number, policy: ScalingPolicy): number {
  if (!Number.isInteger(current) || current < 1 || !Number.isFinite(cpu) || cpu < 0 || !Number.isInteger(policy.minimum) || !Number.isInteger(policy.maximum)
    || policy.minimum < 1 || policy.maximum < policy.minimum || policy.maximum > 20 || !Number.isFinite(policy.targetCpu) || policy.targetCpu < 1 || policy.targetCpu > 100) throw new Error('Invalid scaling sample or policy.');
  if (cpu > policy.targetCpu * 1.1) return Math.min(policy.maximum, Math.max(policy.minimum, Math.ceil(current * cpu / policy.targetCpu)));
  if (cpu < policy.targetCpu * 0.5) return Math.min(policy.maximum, Math.max(policy.minimum, current - 1));
  return Math.min(policy.maximum, Math.max(policy.minimum, current));
}
export async function autoscale(config: DeployConfig): Promise<void> {
  if (process.env.AUTOSCALE_ENABLED !== 'true') throw new Error('Automatic scaling must be explicitly configured.');
  const state = await readState(config.root, 'active.json');
  if (!state) throw new Error('No active release.');
  const cooldownFile = join(config.root, 'autoscale.json');
  try {
    const previous: unknown = JSON.parse(await readFile(cooldownFile, 'utf8'));
    if (previous && typeof previous === 'object' && 'at' in previous && typeof previous.at === 'number' && Date.now() - previous.at < 5 * 60_000) return;
  } catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error; }
  const prefix = `axon-${config.environment}-${state.slot}-`;
  const lines = (await command('docker', ['stats', '--no-stream', '--format', '{{json .}}'])).split('\n').filter(Boolean);
  const samples: Record<'backend' | 'worker', number[]> = { backend: [], worker: [] };
  for (const line of lines) {
    const sample: unknown = JSON.parse(line);
    if (!sample || typeof sample !== 'object' || !('Name' in sample) || !('CPUPerc' in sample) || typeof sample.Name !== 'string' || typeof sample.CPUPerc !== 'string') throw new Error('Invalid container metrics.');
    for (const role of ['backend', 'worker'] as const) {
      if (sample.Name.startsWith(`${prefix}${role}-`)) samples[role].push(Number(sample.CPUPerc.replace('%', '')));
    }
  }
  const desired = (role: 'backend' | 'worker', envPrefix: string) => {
    const values = samples[role];
    if (!values.length) throw new Error('Cannot scale without running container metrics.');
    return chooseReplicas(values.length, values.reduce((sum, value) => sum + value, 0) / values.length, {
      minimum: Number(process.env[`${envPrefix}_MIN`] ?? 1), maximum: Number(process.env[`${envPrefix}_MAX`] ?? 5), targetCpu: Number(process.env[`${envPrefix}_TARGET_CPU`] ?? 70),
    });
  };
  const apiReplicas = desired('backend', 'AUTOSCALE_API'); const workerReplicas = desired('worker', 'AUTOSCALE_WORKER');
  if (apiReplicas === samples.backend.length && workerReplicas === samples.worker.length) return;
  await deployRelease({ ...config, apiReplicas, workerReplicas }, state.manifest, { expectedActiveSha: state.manifest.gitSha });
  await atomicWrite(cooldownFile, JSON.stringify({ at: Date.now(), apiReplicas, workerReplicas }));
}
