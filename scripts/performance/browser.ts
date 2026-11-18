import type { PerformanceActor } from '../../packages/types/src/performance.js';

export async function browserProbe(origin: string, actor: PerformanceActor) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP phase8.example.test 127.0.0.1'] });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    await context.addCookies([{ name: 'axon_token', value: actor.token, domain: 'phase8.example.test', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
    const samples = [];
    for (const path of ['/login', '/dashboard', '/dashboard/products', '/dashboard/invoices']) {
      const page = await context.newPage(); const failures: string[] = [];
      page.on('pageerror', (error) => { failures.push(error.name); });
      const started = performance.now();
      const response = await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(2_000);
      const vitals = await page.evaluate(() => ({
        paint: performance.getEntriesByType('paint').map((entry) => ({ name: entry.name, milliseconds: entry.startTime })),
        resources: performance.getEntriesByType('resource').length,
        transferBytes: performance.getEntriesByType('resource').reduce((sum, entry) => sum + (entry instanceof PerformanceResourceTiming ? entry.transferSize : 0), 0),
        domNodes: document.getElementsByTagName('*').length,
      }));
      samples.push({ path, finalPath: new URL(page.url()).pathname, status: response?.status() ?? 0, elapsedMs: performance.now() - started, failures, ...vitals });
      await page.close();
    }
    return { qualification: 'Local Chromium, self-signed TLS accepted for this synthetic fixture only; four sequential navigations, not browser concurrency capacity.', samples };
  } finally { await browser.close(); }
}
