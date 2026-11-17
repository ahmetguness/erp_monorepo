import { readFile, writeFile } from 'node:fs/promises';
import { generateManifest, parseManifest } from './manifest.js';
import { deployRelease, readDeployConfig } from './deploy.js';
import { readState } from './state.js';
import { validateReleaseSource } from './source.js';
import { autoscale } from './autoscale.js';
import { verifyContainers } from './verify-containers.js';

async function main(): Promise<void> {
  const [action, ...args] = process.argv.slice(2);
  if (action === 'assure' && args[0]) {
    await verifyContainers(parseManifest(JSON.parse(await readFile(args[0], 'utf8')) as unknown));
    return;
  }
  if (action === 'manifest') {
    const [backend, web, migrator, gitSha, output] = args;
    if (!backend || !web || !migrator || !gitSha || !output) throw new Error('manifest needs backend/web/migrator digests, SHA and output file.');
    const manifest = generateManifest(process.cwd(), gitSha, { backend, web, migrator });
    await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
    return;
  }
  const config = readDeployConfig(process.env);
  if (action === 'rollback') {
    const active = await readState(config.root, 'active.json');
    const previous = await readState(config.root, 'previous.json');
    if (!active || !previous) throw new Error('No active and previous release is available.');
    await deployRelease(config, previous.manifest, { rollback: true, expectedActiveSha: active.manifest.gitSha });
  } else if (action === 'scale') {
    const active = await readState(config.root, 'active.json');
    if (!active) throw new Error('No active release to scale.');
    await deployRelease(config, active.manifest, { expectedActiveSha: active.manifest.gitSha });
  } else if (action === 'autoscale') {
    await autoscale(config);
  } else if (action === 'deploy' && args[0]) {
    const manifest = parseManifest(JSON.parse(await readFile(args[0], 'utf8')) as unknown);
    await validateReleaseSource(manifest.gitSha);
    await deployRelease(config, manifest);
  } else throw new Error('Expected manifest, deploy <manifest.json>, or rollback.');
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Release command failed.'); process.exitCode = 1; });
