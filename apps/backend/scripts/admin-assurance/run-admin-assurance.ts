import { spawnSync } from 'node:child_process';
import { ADMIN_ASSURANCE_SUITES } from './suite-manifest.js';

for (const suite of ADMIN_ASSURANCE_SUITES) {
  console.log(`\n[admin-assurance] ${suite.name}: ${suite.verifies.join(', ')}`);
  const commandInterpreter = process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe';
  const result = spawnSync(commandInterpreter, ['/d', '/s', '/c', `npm.cmd run ${suite.command}`], {
    cwd: process.cwd(), stdio: 'inherit', shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`\nAdmin operasyon güvence paketi başarılı (${ADMIN_ASSURANCE_SUITES.length} süit).`);
