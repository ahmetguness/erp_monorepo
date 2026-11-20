import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { DrillCluster } from '../disaster-recovery/cluster.js';
import { LABEL } from '../disaster-recovery/cluster.js';
import { run, type ProcessResult } from '../disaster-recovery/process.js';

export const virtualBrowserImage = 'axon-quality-browser:phase10';

/** A virtual display provides real tab visibility without opening host windows. */
export async function runVirtualBrowser(cluster: DrillCluster, fixture: string, report: string): Promise<ProcessResult> {
  const version = z.object({ version: z.literal('1.63.0') }).safeParse(JSON.parse(await readFile(resolve('node_modules/@playwright/test/package.json'), 'utf8')));
  if (!version.success) throw new Error('Playwright package and virtual browser image must be updated together');
  await cluster.assertOwned('container', cluster.id + '-proxy');
  const mounts: Array<[string, string]> = [
    [resolve('node_modules'), '/workspace/node_modules'],
    [resolve('apps/web/tests/quality'), '/workspace/apps/web/tests/quality'],
    [resolve('apps/web/playwright.quality.config.ts'), '/workspace/apps/web/playwright.quality.config.ts'],
    [resolve('apps/web/tsconfig.json'), '/workspace/apps/web/tsconfig.json'],
    [resolve('apps/web/package.json'), '/workspace/apps/web/package.json'],
    [fixture, '/run/quality-fixture.json'],
  ];
  return run('docker', [
    'run', '--init', '--name', cluster.id + '-browser', '--label', LABEL + '=' + cluster.id,
    '--network', 'container:' + cluster.id + '-proxy', '--cpus', '2', '--memory', '1536m',
    '--shm-size', '256m', '--read-only', '--tmpfs', '/tmp:size=512m,mode=1777',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
    ...mounts.flatMap(([source, target]) => ['--mount', `type=bind,src=${source},dst=${target},readonly`]),
    '--mount', `type=bind,src=${report},dst=/quality-report`,
    '--workdir', '/workspace/apps/web',
    '-e', 'QUALITY_BASE_URL=http://127.0.0.1:8080', '-e', 'QUALITY_FIXTURE_FILE=/run/quality-fixture.json',
    '-e', 'QUALITY_REPORT_DIRECTORY=/quality-report', '-e', 'QUALITY_LONG_SESSION_SECONDS=0',
    '-e', 'PW_TEST_CACHE_DIR=/tmp/pw-cache', '-e', 'XDG_CACHE_HOME=/tmp/cache',
    '-e', 'XDG_CONFIG_HOME=/tmp/config',
    virtualBrowserImage, 'node', '/workspace/node_modules/@playwright/test/cli.js',
    'test', '--config', 'playwright.quality.config.ts', '--headed',
  ]);
}
