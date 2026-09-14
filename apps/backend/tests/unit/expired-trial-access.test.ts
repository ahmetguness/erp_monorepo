import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { requireActiveTrial } from '../../src/middleware/require-active-trial.js';
import { setAccessContext } from '../../src/middleware/access-context.js';
import type { AccessContext } from '../../src/modules/identity/application/access-context.js';

function appFor(trialEndsAt: Date | null) {
  const app = new Hono();
  const access: AccessContext = {
    userId: 'user-1', tenantId: 'tenant-1',
    tenant: { plan: 'PROFESSIONAL', status: 'TRIAL', modules: [], trialEndsAt },
    membership: { id: 'membership-1', roleId: null, roleName: null, isOwner: true, permissions: [] },
    features: new Map(), security: { ipRestrictionEnabled: false, ipWhitelist: [] },
  };
  app.use('*', async (context, next) => { setAccessContext(context, access); await next(); });
  app.use('*', requireActiveTrial);
  app.get('/api/products', (context) => context.json({ data: [] }));
  app.get('/api/checkout/context', (context) => context.json({ data: { allowed: true } }));
  return app;
}

describe('expired trial access gate', () => {
  it('keeps ordinary reads available after trial expiry', async () => {
    const response = await appFor(new Date(Date.now() - 1_000)).request('/api/products');
    expect(response.status).toBe(200);
  });
  it('blocks mutations after trial expiry', async () => {
    const app = appFor(new Date(Date.now() - 1_000));
    app.post('/api/products', (context) => context.json({ data: { created: true } }));
    const response = await app.request('/api/products', { method: 'POST' });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'TRIAL_EXPIRED' } });
  });
  it('keeps only checkout APIs available for conversion', async () => {
    const response = await appFor(new Date(Date.now() - 1_000)).request('/api/checkout/context');
    expect(response.status).toBe(200);
  });
  it('does not block an active trial', async () => {
    const response = await appFor(new Date(Date.now() + 60_000)).request('/api/products');
    expect(response.status).toBe(200);
  });
});
