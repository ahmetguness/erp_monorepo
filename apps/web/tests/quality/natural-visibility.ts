import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { z } from 'zod';

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await pause(100);
  }
  child.kill('SIGKILL');
  for (let attempt = 0; attempt < 10; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await pause(100);
  }
  throw new Error('Natural visibility browser did not exit after bounded cleanup');
}

/** A real browser lifecycle: Playwright's normal focus override masks visibility. */
export async function withNaturalVisibility<Result>(measure: (context: BrowserContext, page: Page) => Promise<Result>): Promise<Result> {
  if (process.platform !== 'linux') throw new Error('Natural visibility measurement requires the owned Linux virtual display');
  const profile = await mkdtemp(join(tmpdir(), 'phase10-natural-'));
  let browser: Browser | undefined;
  const child = spawn(chromium.executablePath(), [
    '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=0',
    '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--window-size=1280,800', 'about:blank',
  ], { stdio: 'ignore' });
  let startupFailed = false;
  child.on('error', () => { startupFailed = true; });
  try {
    let port: number | undefined;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (startupFailed || child.exitCode !== null || child.signalCode !== null) throw new Error('Natural visibility browser could not start');
      try {
        port = z.coerce.number().int().min(1).max(65535).parse((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
        break;
      } catch { await pause(100); }
    }
    if (!port) throw new Error('Natural visibility browser startup deadline exceeded');
    browser = await chromium.connectOverCDP('http://127.0.0.1:' + port, { noDefaults: true, timeout: 10000 });
    // noDefaults applies to the existing default context only. A new context
    // would re-enable focus emulation and invalidate the measurement again.
    const context = browser.contexts()[0];
    if (!context) throw new Error('Missing default browser context');
    const page = context.pages()[0] ?? await context.newPage();
    return await measure(context, page);
  } finally {
    try { await browser?.close(); }
    finally {
      await stop(child);
      const inside = relative(tmpdir(), profile);
      if (isAbsolute(inside) || inside.startsWith('..') || !inside.startsWith('phase10-natural-')) throw new Error('Unsafe browser profile cleanup');
      await rm(profile, { recursive: true, force: true });
    }
  }
}
