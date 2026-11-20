import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { run, docker } from '../disaster-recovery/process.js';
async function main(): Promise<void> {
  const directory = resolve('artifacts', 'phase10-build');
  await mkdir(directory, { recursive: true });
  const images = [];
  const release = ['--build-arg', 'RELEASE_VERSION=0.0.0-phase10-local', '--build-arg', 'RELEASE_GIT_SHA=' + '0'.repeat(40)];
  for (const [name, file, target, image] of [
    ['backend', 'apps/backend/Dockerfile', 'runner', 'axon-performance-backend:phase10'],
    ['migrator', 'apps/backend/Dockerfile', 'migrator', 'axon-performance-migrator:phase10'],
    ['web', 'apps/web/Dockerfile', null, 'axon-performance-web:phase10'],
    ['dr', 'deploy/dr/Dockerfile', null, 'axon-postgres-dr:phase10'],
    ['browser', 'deploy/observability/browser.Dockerfile', null, 'axon-quality-browser:phase10'],
  ] as const) {
    console.log('Building owned Phase10 ' + name + ' image');
    const result = await run('docker', ['build', ...(target ? ['--target', target] : []), ...(['dr', 'browser'].includes(name) ? [] : release), '-f', file, '-t', image, '.']);
    await writeFile(resolve(directory, name + '.log'), result.stdout + '\n' + result.stderr);
    if (result.code !== 0)
      throw new Error('Phase10 ' + name + ' build failed; inspect saved diagnostics');
    images.push({ name, image, digest: await docker(['image', 'inspect', '--format', '{{.Id}}', image]) });
  }
  await writeFile(resolve(directory, 'images.json'), JSON.stringify({ localOnly: true, workingTreeBuild: true, releaseShaPlaceholder: '0'.repeat(40), images }, null, 2));
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Owned build failed'); process.exitCode = 1; });
