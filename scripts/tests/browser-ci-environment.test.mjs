import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

for (const jobName of ['browser-smoke', 'browser-regression']) {
  test(`${jobName} builds the browser client against the real CI API`, () => {
    const job = workflow.match(new RegExp(`^  ${jobName}:\\r?\\n([\\s\\S]*?)(?=^  [a-z][a-z-]*:|$(?![\\s\\S]))`, 'm'))?.[1];
    assert.ok(job, `Missing job: ${jobName}`);
    // NEXT_PUBLIC variables are inlined during next build, before the API starts.
    assert.match(job, /^    env:\r?\n      NEXT_PUBLIC_API_URL: http:\/\/localhost:3001\r?$/m);
    assert.match(job, /run: npm run build:web/);
    assert.match(job, /uses: \.\/\.github\/actions\/browser-environment/);
  });
}
