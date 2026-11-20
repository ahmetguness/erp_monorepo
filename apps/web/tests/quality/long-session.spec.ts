import { setTimeout as pause } from 'node:timers/promises';
import { test, expect } from '@playwright/test';
import { z } from 'zod';
import { login } from './support';
const seconds = Number(process.env.QUALITY_LONG_SESSION_SECONDS);
if (!Number.isSafeInteger(seconds) || seconds < 900 || seconds > 1500)
  throw new Error('Long-session measurement requires an explicit 15–25 minute window');
test('production SPA retains a bounded post-GC working set across a real long session and tenant changes', async ({ page, context }, testInfo) => {
  test.setTimeout(seconds * 1000 + 60000);
  const protocol = await context.newCDPSession(page), errors: string[] = [], failures: number[] = [];
  page.on('pageerror', error => errors.push(error.name));
  page.on('response', response => {
    if (new URL(response.url()).pathname.startsWith('/api/') && response.status() >= 500)
      failures.push(response.status());
  });
  await login(context, 0);
  await page.goto('/dashboard/products');
  await expect(page.locator('table')).toBeVisible();
  const move = async () => {
    await page.getByRole('link', { name: 'Cari Hesaplar', exact: true }).first().click();
    await expect(page.locator('table')).toBeVisible();
    const products = page.getByRole('link', { name: 'Ürünler', exact: true }).first();
    if (!await products.isVisible())
      await page.getByRole('button', { name: 'Ürünler & Stok', exact: true }).click();
    await products.click();
    await expect(page.locator('table tbody tr')).toHaveCount(20);
  };
  for (let i = 0; i < 4; i++)
    await move();
  const measure = async () => {
    await protocol.send('HeapProfiler.collectGarbage');
    const heap = z.object({ usedSize: z.number(), totalSize: z.number() }).parse(await protocol.send('Runtime.getHeapUsage'));
    const dom = z.object({ documents: z.number(), nodes: z.number(), jsEventListeners: z.number() }).parse(await protocol.send('Memory.getDOMCounters'));
    return { elapsedSeconds: (Date.now() - started) / 1000, heap, dom };
  };
  const started = Date.now(), samples = [await measure()];
  let iteration = 0;
  while (Date.now() - started < seconds * 1000) {
    await move();
    iteration++;
    if (iteration % 15 === 0) {
      await login(context, iteration % 30 === 0 ? 0 : 1);
      await page.reload();
      await expect(page.locator('table')).toBeVisible();
    }
    if (iteration % 3 === 0)
      samples.push(await measure());
    await pause(Math.min(10000, Math.max(1, seconds * 1000 - (Date.now() - started))));
  }
  samples.push(await measure());
  const baseline = samples[0], last = samples.at(-1);
  if (!last)
    throw new Error('Missing memory evidence');
  const measuredSeconds = (Date.now() - started) / 1000;
  await testInfo.attach('long-session-memory', { body: JSON.stringify({ measuredSeconds, iteration, samples, postGcGrowthBytes: last.heap.usedSize - baseline.heap.usedSize, qualification: 'Owned synthetic production renderer, Chromium CDP; laboratory observation, not proof against every memory leak or field CWV certification' }, null, 2), contentType: 'application/json' });
  expect(measuredSeconds).toBeGreaterThanOrEqual(seconds);
  expect(last.heap.usedSize - baseline.heap.usedSize).toBeLessThan(48 * 1024 * 1024);
  expect(Math.max(...samples.map(row => row.heap.usedSize))).toBeLessThan(200 * 1024 * 1024);
  expect(errors).toEqual([]);
  expect(failures).toEqual([]);
});
