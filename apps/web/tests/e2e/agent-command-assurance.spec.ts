import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page) {
  await page.route('**/api/settings', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: [{ id: 'wizard', key: 'wizard_completed', value: 'true' }] }),
  }));
  await page.goto('/login');
  await page.getByLabel(/E-posta/).fill('admin@axondemo.com');
  await page.getByRole('textbox', { name: /ifre/, exact: true }).fill('demo1234');
  await page.getByRole('button', { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('prompt plan, approval click, idempotent execute and suggestion adoption flow', async ({ page }) => {
  let executeCalls = 0;
  let adopted = false;
  await page.route('**/api/agent-command/workflow-suggestions', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: [{ suggestionId: 'SUGG-001', triggerCondition: 'Test trigger', actionToAutomate: 'Test action', confidencePct: 96, recommendedRuleName: 'Test rule', isAdopted: adopted }] }),
  }));
  await page.route('**/api/agent-command/parse-prompt', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { planId: 'PLAN-e2e', prompt: 'PO taslagi', intentCategory: 'PROCUREMENT_DISPATCH', riskLevel: 'MEDIUM', requiresApproval: true, createdAt: new Date().toISOString(), steps: [{ stepIndex: 1, intent: 'PO', actionDescription: 'Taslak hazirla', targetEntity: 'PurchaseOrder', status: 'PENDING' }] } }),
  }));
  await page.route('**/api/agent-command/execute-plan', async (route) => {
    executeCalls++;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { success: true, message: 'Plan icra edildi', executedStepsCount: 1 } }) });
  });
  await page.route('**/api/agent-command/adopt-suggestion', async (route) => {
    adopted = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { success: true, message: 'Kural aktif', ruleId: 'rule-1' } }) });
  });

  await prepare(page);
  await page.goto('/dashboard/agent/command');
  const input = page.locator('input[type="text"]').first();
  await input.fill('PO taslagi');
  await page.getByRole('button', { name: /Komutu Analiz Et/ }).click();
  await expect(page.getByText(/PLAN-e2e/)).toBeVisible();
  await page.locator('button').filter({ hasText: /cra Et/ }).click();
  await expect.poll(() => executeCalls).toBe(1);
  await expect(page.getByText('EXECUTED')).toBeVisible();
  await page.locator('button').filter({ hasText: /olarak/ }).click();
  await expect.poll(() => adopted).toBe(true);
});

test('loading error is visible and retryable', async ({ page }) => {
  let calls = 0;
  let recover = false;
  await page.route('**/api/agent-command/workflow-suggestions', async (route) => {
    calls++;
    if (!recover) await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'controlled' } }) });
    else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
  });
  await prepare(page);
  await page.goto('/dashboard/agent/command');
  await expect(page.getByText(/controlled|yüklenemedi|alınamadı/i)).toBeVisible({ timeout: 15_000 });
  const retry = page.getByRole('button', { name: /Tekrar dene/i });
  await expect(retry).toBeVisible();
  recover = true;
  await retry.click();
  await expect.poll(() => calls).toBeGreaterThan(1);
});
