import type { Page } from '@playwright/test';
import { z } from 'zod';
import { TenantApi } from './tenant-api';

export async function tenantSession(page: Page) {
  const database = new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
  if (!database.endsWith('_ci')) throw new Error('Cross-module browser tests require a dedicated *_ci database.');
  await page.goto('/login');
  await page.getByLabel('E-posta adresi').fill('admin@axondemo.com');
  await page.getByLabel('Şifre', { exact: true }).fill('demo1234');
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await page.waitForURL(/\/dashboard/);
  const api = new TenantApi(page.request, new URL(page.url()).origin);
  const identity = await api.send('GET', '/api/auth/me', z.object({ tenant: z.object({ id: z.string() }) }));
  return { api, tenantId: identity.tenant.id };
}
