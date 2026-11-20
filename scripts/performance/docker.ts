import { command } from '../release/process.js';
import { object, string } from './validation.js';
import { setTimeout as pause } from 'node:timers/promises';
export const docker = (args: readonly string[]) => command('docker', args, process.env, { outputLimit: 2_000_000, failOnTruncation: true });
export const dockerLogs = (container: string) => command('docker', ['logs', '--tail', '1000', container], process.env, { captureStderr: true });
export async function publishedPort(container: string, port: number): Promise<number> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const ports: unknown = JSON.parse(await docker(['inspect', '--format', '{{json .NetworkSettings.Ports}}', container]));
    const bindings: unknown = ports && typeof ports === 'object' ? Reflect.get(ports, `${port}/tcp`) : null;
    if (Array.isArray(bindings) && bindings[0]) {
      const value = Number(string(object(bindings[0]).HostPort));
      if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error('Invalid published test port.');
      return value;
    }
    await pause(250);
  }
  throw new Error('Missing published test port.');
}
export async function dockerMetrics(owner: string): Promise<unknown[]> {
  const ids = (await docker(['ps', '--filter', `label=com.axon.performance=${owner}`, '--format', '{{.ID}}'])).split('\n').filter(Boolean);
  if (!ids.length) return [];
  if (!ids.every((id) => /^[a-f0-9]{12,64}$/.test(id))) throw new Error('Invalid measurement container identity.');
  const lines = await docker(['stats', '--no-stream', '--format', '{{json .}}', ...ids]);
  return lines.split('\n').filter(Boolean).map((line) => JSON.parse(line) as unknown);
}

export async function waitForContainer(container: string, timeoutMs: number): Promise<number> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const state = object(JSON.parse(await docker(['inspect', '--format', '{{json .State}}', container])) as unknown);
    if (state.Running === false) {
      if (typeof state.ExitCode !== 'number' || !Number.isInteger(state.ExitCode)) throw new Error('Missing workload exit code.');
      return state.ExitCode;
    }
    await pause(2000);
  }
  throw new Error('Performance workload exceeded its bounded run deadline.');
}
