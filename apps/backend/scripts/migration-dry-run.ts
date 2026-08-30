import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const moduleResolver = createRequire(resolve(process.cwd(), 'package.json'));
const prismaCli = moduleResolver.resolve('prisma/build/index.js');

const result = spawnSync(
  process.execPath,
  [
    prismaCli,
    'migrate',
    'diff',
    '--from-schema-datasource',
    'prisma/schema',
    '--to-schema-datamodel',
    'prisma/schema',
    '--script',
  ],
  { stdio: 'inherit' },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
