import { mkdir, readFile, rename, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseManifest, type ReleaseManifest } from './manifest.js';

export interface DeploymentState { slot: 'blue' | 'green'; manifest: ReleaseManifest }
export function parseState(value: unknown): DeploymentState {
  if (typeof value !== 'object' || value === null || !('slot' in value) || !('manifest' in value) || (value.slot !== 'blue' && value.slot !== 'green')) throw new Error('Invalid deployment state.');
  return { slot: value.slot, manifest: parseManifest(value.manifest) };
}
export async function readState(root: string, file: 'active.json' | 'previous.json'): Promise<DeploymentState | null> {
  try { return parseState(JSON.parse(await readFile(join(root, file), 'utf8')) as unknown); }
  catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null; throw error; }
}
export async function atomicWrite(file: string, contents: string): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents, { mode: 0o600 });
  await rename(temporary, file);
}
export async function acquireDeploymentLock(directory: string): Promise<() => Promise<void>> {
  if (!isAbsolute(directory) || resolve(directory) === resolve(directory, '..')) throw new Error('Deployment state needs a dedicated absolute directory.');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = join(directory, 'deployment.lock');
  await mkdir(lock, { mode: 0o700 });
  await writeFile(join(lock, 'owner'), `${process.pid}\n`, { mode: 0o600 });
  return async () => { await unlink(join(lock, 'owner')); await rmdir(lock); };
}
export async function requirePrivateEnv(file: string): Promise<void> {
  if (!isAbsolute(file)) throw new Error('Deployment env file must use an absolute path.');
  const info = await stat(file);
  if (!info.isFile() || (process.platform !== 'win32' && (info.mode & 0o077) !== 0)) throw new Error('Deployment env file must be private (mode 0600).');
}

export async function snapshotDefinition(root: string, sha: string): Promise<void> {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid release source.');
  const directory = join(root, 'definitions', sha);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  for (const file of ['compose.yml', 'edge.compose.yml']) {
    const contents = await readFile(resolve('deploy', file), 'utf8');
    try { await writeFile(join(directory, file), contents, { flag: 'wx', mode: 0o600 }); }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
      if (await readFile(join(directory, file), 'utf8') !== contents) throw new Error('Deployment definitions for a commit are immutable.');
    }
  }
}
