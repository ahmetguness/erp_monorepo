import { readFile } from 'node:fs/promises';

const denied = /^(?:AGPL|GPL|SSPL)(?:-|$)/i;
const exceptions = new Set(JSON.parse(await readFile(new URL('../config/license-exceptions.json', import.meta.url), 'utf8')));
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
const violations = [];

for (const [packagePath, metadata] of Object.entries(lock.packages ?? {})) {
  if (!packagePath.includes('node_modules/') || !metadata || typeof metadata !== 'object') continue;
  const version = 'version' in metadata && typeof metadata.version === 'string' ? metadata.version : 'unknown';
  const license = 'license' in metadata && typeof metadata.license === 'string' ? metadata.license : 'UNKNOWN';
  const name = packagePath.slice(packagePath.lastIndexOf('node_modules/') + 'node_modules/'.length);
  const identity = `${name}@${version}`;
  if (denied.test(license) && !exceptions.has(identity)) violations.push(`${identity}: ${license}`);
}

if (violations.length > 0) throw new Error(`Denied licenses:\n${violations.join('\n')}`);
console.log(`License policy: OK (${exceptions.size} documented exception)`);
