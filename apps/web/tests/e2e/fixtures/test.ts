import { test as base } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export * from '@playwright/test';
export { isCancelledReadRequest } from './network-failures';

// UI regression validates our application, independently of the availability
// of the live central-bank service. Currency-specific tests can override this
// route to exercise errors and alternative rates.
export const test = base.extend({
  context: async ({ context }, provideContext) => {
    const fixturePath = path.resolve(__dirname, '../../../../../artifacts/browser/initialized-users.json');
    if (existsSync(fixturePath)) {
      const userIds: string[] = JSON.parse(readFileSync(fixturePath, 'utf8'));
      await context.addInitScript((ids) => {
        for (const id of ids) localStorage.setItem(`axon_onboarding_done_${id}`, '1');
      }, userIds);
    }
    await context.route('**/api/currency-rates/tcmb', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { date: '24.10.2026', currencies: [] } }),
    }));
    await provideContext(context);
  },
});
