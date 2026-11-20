import { randomUUID } from 'node:crypto';
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import axe from 'axe-core';
import { z } from 'zod';
declare global {
  interface Window {
    axe: typeof axe;
    phase10RecordVital(value: { name: string; value: number }): Promise<void>;
    phase10RecordInteraction(value: { name: string; duration: number; inputDelay: number; processing: number; presentation: number }): Promise<void>;
  }
}
import { login } from './support';
import { withNaturalVisibility } from './natural-visibility';
async function violations(page: Page) {
  await page.addScriptTag({ content: axe.source });
  const raw: unknown = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }));
  return z.object({ violations: z.array(z.object({ id: z.string(), impact: z.string().nullable(), description: z.string(), nodes: z.array(z.object({ target: z.array(z.unknown()) })) })) }).parse(raw).violations;
}
test('real authenticated products, contacts and invoices render without hydration errors in both engines', async ({ page, context }) => {
  const actor = await login(context);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.name));
  for (const [path, heading] of [['products', 'Ürün'], ['contacts', 'Cari'], ['invoices', 'Fatura']] as const) {
    await page.goto('/dashboard/' + path);
    await expect(page.getByRole('heading', { name: new RegExp(heading) }).first()).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
  }
  await page.goto('/dashboard/products');
  await page.getByPlaceholder("Kod, ad, barkod ara...").fill(`Phase10 ${actor.plan}`);
  await expect(page.getByText(`Phase10 ${actor.plan} exclusive product`, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test('permission failure is announced and does not present cached data as an empty result; retry recovers', async ({ page, context }) => {
  await login(context);
  await page.route('**/api/products?**', route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Synthetic permission boundary' } }) }));
  await page.goto('/dashboard/products');
  await expect(page.getByRole('alert').filter({ hasText: 'Yetki gerekli' })).toBeVisible();
  await expect(page.getByText('Kayıt bulunamadı', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Phase10 STARTER exclusive product', { exact: true })).toHaveCount(0);
  await page.unroute('**/api/products?**');
  await page.reload();
  await page.getByPlaceholder('Kod, ad, barkod ara...').fill('Phase10 STARTER');
  await expect(page.getByText('Phase10 STARTER exclusive product', { exact: true })).toBeVisible();
});
test('network failure shows recovery and real retry fetches the original data', async ({ page, context }) => {
  await login(context);
  await page.route('**/api/products?**', route => route.abort('timedout'));
  await page.goto('/dashboard/products');
  await expect(page.getByRole('alert').filter({ hasText: /Bağlantı kurulamadı|Yanıt zaman aşımına uğradı/ })).toBeVisible();
  await page.unroute('**/api/products?**');
  await page.getByRole('button', { name: 'Tekrar dene' }).click();
  await page.getByPlaceholder('Kod, ad, barkod ara...').fill('Phase10 STARTER');
  await expect(page.getByText('Phase10 STARTER exclusive product', { exact: true })).toBeVisible();
  await page.getByPlaceholder('Kod, ad, barkod ara...').fill('phase10-no-match-' + randomUUID());
  await expect(page.getByText('Ürün bulunamadı', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tekrar dene' })).toHaveCount(0);
});
test('loading, trial restriction and partial-data states are distinct and recovery preserves authoritative rows', async ({ page, context }) => {
  await login(context);
  let release: () => void = () => undefined;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/products?**', async (route) => { await pending; await route.continue(); });
  await page.goto('/dashboard/products');
  await expect(page.getByRole('status').filter({ hasText: 'Kayıtlar yükleniyor.' })).toBeVisible();
  release();
  await expect(page.locator('table tbody tr')).not.toHaveCount(0);
  await page.unroute('**/api/products?**');
  await page.route('**/api/products?**', route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'TRIAL_EXPIRED', message: 'Synthetic trial expiry' } }) }));
  await page.getByPlaceholder('Kod, ad, barkod ara...').fill('Phase10');
  await expect(page.getByRole('alert').filter({ hasText: 'Deneme süresi doldu' }).first()).toBeVisible();
  await expect(page.locator('table')).toHaveCount(0);
  await page.unroute('**/api/products?**');
  await page.reload();
  await expect(page.locator('table')).toBeVisible();
  const search = page.getByPlaceholder('Kod, ad, barkod ara...');
  if (await search.inputValue() !== '') {
    const cached = page.waitForResponse(response => { const url = new URL(response.url()); return url.pathname === '/api/products' && !url.searchParams.get('search') && response.status() === 200; });
    await search.fill('');
    await cached;
  }
  await expect(page.locator('table tbody tr')).toHaveCount(20);
  await page.route('**/api/products?**', route => route.abort('connectionreset'));
  // Force a real stale refetch by navigating away and back in the same SPA.
  await page.getByRole('link', { name: 'Cari Hesaplar', exact: true }).first().click();
  await expect(page.locator('table')).toBeVisible();
  await page.getByRole('link', { name: 'Ürünler', exact: true }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Son alınan kayıtlar gösteriliyor.' })).toBeVisible();
  await expect(page.locator('table')).toBeVisible();
  await page.unroute('**/api/products?**');
  await page.getByRole('button', { name: 'Tekrar dene' }).click();
  await expect(page.getByText('Son alınan kayıtlar gösteriliyor.', { exact: false })).toHaveCount(0);
});
test('new cookie session A to B to A rebuilds the real screen without foreign-tenant rows or previous search state', async ({ page, context }) => {
  for (const index of [0, 1, 0]) {
    const actor = await login(context, index);
    await page.goto('/dashboard/products');
    await expect(page.getByPlaceholder('Kod, ad, barkod ara...')).toHaveValue('');
    await page.getByPlaceholder("Kod, ad, barkod ara...").fill(`Phase10 ${actor.plan}`);
    await expect(page.getByText(`Phase10 ${actor.plan} exclusive product`, { exact: true })).toBeVisible();
    for (const plan of ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'])
      if (plan !== actor.plan)
        await expect(page.getByText(`Phase10 ${plan} exclusive product`, { exact: true })).toHaveCount(0);
    await page.getByPlaceholder('Kod, ad, barkod ara...').fill('synthetic-search-state');
  }
});
test('real payment double submission and a lost commit response survive reload with exactly one financial record', async ({ page, context }) => {
  const actor = await login(context, 2), reference = 'phase10-browser-' + randomUUID();
  page.on('dialog', dialog => { void dialog.accept(); });
  const keys: string[] = [], ids: string[] = [];
  let loseResponse = true;
  await page.route('**/api/payments', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    keys.push(z.object({ idempotencyKey: z.string() }).parse(route.request().postDataJSON()).idempotencyKey);
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    ids.push(z.object({ data: z.object({ id: z.string() }) }).parse(await response.json()).data.id);
    if (loseResponse) {
      loseResponse = false;
      await route.abort('timedout');
    }
    else
      await route.fulfill({ response });
  });
  const fill = async () => {
    await page.getByRole('spinbutton', { name: 'Tutar', exact: true }).fill('17');
    await page.getByLabel('Dekont / Referans').fill(reference);
    await page.getByRole('combobox', { name: 'Kasa hesabı' }).click();
    await page.getByRole('option', { name: /Synthetic cash/ }).click();
  };
  await page.goto(`/dashboard/payments/new?contactId=${encodeURIComponent(actor.contactId)}`);
  await fill();
  const submit = page.getByRole('button', { name: 'Kaydet', exact: true });
  await submit.evaluate(element => {
    if (!(element instanceof HTMLButtonElement))
      throw new Error('Expected real submit button'); element.click(); element.click();
  });
  await expect.poll(() => ids.length).toBe(1);
  await expect(submit).toBeEnabled();
  await page.reload();
  await fill();
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/payments(?:\?|$)/);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(ids[0]).toBe(ids[1]);
  const raw: unknown = await page.evaluate(async () => {
    const response = await fetch('/api/payments?limit=200'); if (!response.ok)
      throw new Error('Real payment verification failed'); return response.json();
  });
  const rows = z.object({ data: z.array(z.object({ id: z.string(), reference: z.string().nullable() })) }).parse(raw).data;
  expect(rows.filter(row => row.reference === reference).map(row => row.id)).toEqual([ids[0]]);
});
test('payment dialog traps keyboard focus and returns it to the invoking control on Escape', async ({ page, context }) => {
  await login(context, 2);
  await page.goto('/dashboard/payments');
  const trigger = page.getByRole('button', { name: 'Yeni Ödeme', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Yeni Ödeme Kaydı' });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 18; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
test('WCAG AA automated checks on real login and authenticated product table; keyboard focus remains usable', async ({ page, context }, testInfo) => {
  await page.goto('/login');
  let issues = await violations(page);
  await testInfo.attach('login-axe', { body: JSON.stringify(issues, null, 2), contentType: 'application/json' });
  expect(issues).toEqual([]);
  const email = page.getByLabel('E-posta adresi');
  await email.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Şifremi unuttum' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Şifre', { exact: true })).toBeFocused();
  await login(context);
  await page.goto('/dashboard/products');
  await expect(page.locator('table')).toBeVisible();
  issues = await violations(page);
  await testInfo.attach('products-axe', { body: JSON.stringify(issues, null, 2), contentType: 'application/json' });
  expect(issues).toEqual([]);
  const actions = page.getByRole('button', { name: 'Satır işlemleri', exact: true }).first();
  await actions.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  const menuItems = page.getByRole('menuitem');
  await expect(menuItems.first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menuItems.nth(1)).toBeFocused();
  issues = await violations(page);
  await testInfo.attach('products-open-menu-axe', { body: JSON.stringify(issues, null, 2), contentType: 'application/json' });
  expect(issues).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(actions).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
});
test('product category combobox exposes its options and keyboard selection without creating a record', async ({ page, context }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.name));
  await login(context);
  await page.goto('/dashboard/products/new');
  const category = page.getByRole('combobox', { name: 'Kategori', exact: true });
  await category.focus();
  const listbox = page.getByRole('listbox', { name: 'Kategori', exact: true });
  await expect(listbox).toBeVisible();
  const empty = listbox.getByRole('option', { name: '— Seçim yok —', exact: true });
  await expect(empty).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(category).toHaveAttribute('aria-activedescendant', await empty.getAttribute('id') ?? '');
  await page.keyboard.press('Enter');
  await expect(listbox).toHaveCount(0);
  await expect(category).toBeFocused();
  await category.fill('Synthetic unsaved category');
  await expect(listbox.getByRole('option', { name: /Yeni kategori/ })).toBeVisible();
  await page.getByRole('combobox', { name: 'KDV Oranı', exact: true }).click({ trial: true });
  const issues = await violations(page);
  await testInfo.attach('product-open-category-axe', { body: JSON.stringify(issues, null, 2), contentType: 'application/json' });
  expect(issues).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(listbox).toHaveCount(0);
  await expect(category).toBeFocused();
  expect(pageErrors).toEqual([]);
});

test('production navigation performance, bounded session resource trend and web-vitals are recorded without identity', async ({ page, context }, testInfo) => {
  const measure = async (page: Page, context: BrowserContext) => {
    const origin = new URL(process.env.QUALITY_BASE_URL ?? '').origin;
    await login(context);
    const metrics: Array<{ name: string; value: number }> = [];
    const interactions: Array<{ name: string; duration: number; inputDelay: number; processing: number; presentation: number }> = [];
    await page.exposeFunction('phase10RecordVital', (value: unknown) => {
      metrics.push(z.object({ name: z.string(), value: z.number().nonnegative() }).parse(value));
      metrics.splice(0, Math.max(0, metrics.length - 200));
    });
    await page.exposeFunction('phase10RecordInteraction', (value: unknown) => {
      interactions.push(z.object({ name: z.string().max(40), duration: z.number().nonnegative(), inputDelay: z.number().nonnegative(), processing: z.number().nonnegative(), presentation: z.number().nonnegative() }).parse(value));
      interactions.splice(0, Math.max(0, interactions.length - 200));
    });
    await page.addInitScript(() => {
      window.addEventListener('axon:web-vital', event => {
        const detail: unknown = event instanceof CustomEvent ? event.detail : undefined;
        if (typeof detail === 'object' && detail !== null && 'name' in detail && 'value' in detail && typeof detail.name === 'string' && typeof detail.value === 'number') {
          void window.phase10RecordVital({ name: detail.name, value: detail.value });
        }
      });
      if (PerformanceObserver.supportedEntryTypes.includes('event')) {
        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            if (!(entry instanceof PerformanceEventTiming) || entry.interactionId === 0) continue;
            void window.phase10RecordInteraction({ name: entry.name, duration: entry.duration, inputDelay: Math.max(0, entry.processingStart - entry.startTime), processing: Math.max(0, entry.processingEnd - entry.processingStart), presentation: Math.max(0, entry.startTime + entry.duration - entry.processingEnd) });
          }
        });
        const observation: PerformanceObserverInit & { durationThreshold: number } = { type: 'event', buffered: true, durationThreshold: 16 };
        observer.observe(observation);
      }
    });
    await page.goto(origin + '/dashboard/products');
    await expect(page.locator('table')).toBeVisible();
    const resources = [];
    for (let i = 0; i < 12; i++) {
      await page.goto(origin + '/dashboard/' + (i % 2 ? 'contacts' : 'products'));
      await expect(page.locator('table')).toBeVisible();
      resources.push(await page.evaluate(() => { const scripts = performance.getEntriesByType('resource').filter((row): row is PerformanceResourceTiming => row instanceof PerformanceResourceTiming && row.initiatorType === 'script'); return { navigation: performance.getEntriesByType('navigation').map(row => ({ duration: row.duration })), resources: performance.getEntriesByType('resource').length, domNodes: document.querySelectorAll('*').length, encodedJsBytes: scripts.reduce((sum, row) => sum + row.encodedBodySize, 0), transferredJsBytes: scripts.reduce((sum, row) => sum + row.transferSize, 0) }; }));
    }
    await page.getByRole('button', { name: 'Bildirimler', exact: true }).click();
    await page.getByRole('button', { name: 'Bildirimler', exact: true }).click();
    if (testInfo.project.name === 'quality-chromium') {
      const protocol = await context.newCDPSession(page);
      const window = z.object({ windowId: z.number().int() }).parse(await protocol.send('Browser.getWindowForTarget'));
      await protocol.send('Browser.setWindowBounds', { windowId: window.windowId, bounds: { windowState: 'minimized' } });
    }
    // Real tab backgrounding completes vitals. Headless Windows keeps every
    // document visible; the quality runner uses a Linux virtual display instead.
    const background = await context.newPage();
    await background.goto('about:blank');
    await background.bringToFront();
    try {
      if (testInfo.project.name === 'quality-chromium') {
        await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('hidden');
        await expect.poll(() => ['LCP', 'CLS', 'INP'].every(name => metrics.some(row => row.name === name))).toBe(true);
      }
    } finally {
      await testInfo.attach('production-navigation', { body: JSON.stringify({ resources, vitals: metrics, interactions, qualification: '12 real full navigations; not a long-session memory-leak or field CWV certification' }, null, 2), contentType: 'application/json' });
    }
    await background.close();
    if (testInfo.project.name === 'quality-chromium') {
      for (const [name, limit] of [['LCP', 2500], ['CLS', 0.1], ['INP', 200]] as const) {
        const measured = metrics.filter(row => row.name === name);
        expect(measured.length).toBeGreaterThan(0);
        expect(Math.max(...measured.map(row => row.value))).toBeLessThanOrEqual(limit);
      }
    }
    expect(resources.every(row => row.domNodes < 15000)).toBe(true);
  };
  if (testInfo.project.name === 'quality-chromium')
    await withNaturalVisibility((context, page) => measure(page, context));
  else
    await measure(page, context);
});
