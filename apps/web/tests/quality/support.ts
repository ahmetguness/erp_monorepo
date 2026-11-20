import { readFile } from 'node:fs/promises';
import type { BrowserContext } from '@playwright/test';
import { z } from 'zod';
const schema = z.object({ actors: z.array(z.object({ token: z.string(), tenantId: z.string(), userId: z.string(), contactId: z.string(), plan: z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']) })).min(3) });
export async function login(context: BrowserContext, index = 0) {
  const actors = schema.parse(JSON.parse(await readFile(process.env.QUALITY_FIXTURE_FILE ?? '', 'utf8'))).actors, actor = actors[index];
  if (!actor)
    throw new Error('Missing synthetic browser actor');
  await context.addCookies([{ name: 'axon_token', value: actor.token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await context.addInitScript(ids => {
    for (const id of ids)
      localStorage.setItem(`axon_onboarding_done_${id}`, '1');
  }, actors.map(row => row.userId));
  return actor;
}
