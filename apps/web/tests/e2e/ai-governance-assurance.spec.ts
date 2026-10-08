import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/E-posta/).fill('admin@axondemo.com');
  await page.getByRole('textbox', { name: /ifre/, exact: true }).fill('demo1234');
  await page.getByRole('button', { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/dashboard/);
  const close = page.getByRole('button', { name: /Onboarding.*kapat/ });
  await close.waitFor({ state: 'visible', timeout: 1200 }).then(() => close.click()).catch(() => undefined);
}

const policy = { policy: { enabled: true, dataSharingPolicy: 'BUSINESS_CONTEXT', logPrompts: true }, redactionRegistry: { fieldKeys: ['email', 'phone'], rules: [{ key: 'email', label: 'E-posta', scope: 'all' }] } };
const insights = {
  costSettings: { monthlyCostLimitUsd: 10, alertThresholdPercent: 80, blockOnLimit: false },
  costSummary: { periodStart: '2026-10-01T00:00:00.000Z', periodEnd: '2026-10-08T00:00:00.000Z', totalRequests: 3, totalTokens: 3000, estimatedCostUsd: 0.0056, monthlyCostLimitUsd: 10, alertThresholdPercent: 80, blockOnLimit: false, usagePercent: 0.06, status: 'OK', remainingUsd: 9.9944 },
  modelUsage: [{ model: 'gpt-4o', requestCount: 1, promptTokens: 400, completionTokens: 600, totalTokens: 1000, estimatedCostUsd: 0.005 }],
  maskingReport: [{ fieldKey: 'email', label: 'E-posta', scope: 'all', occurrences: 1, affectedRequests: 1, lastSeenAt: '2026-10-08T00:00:00.000Z', topRequestTypes: [{ requestType: 'PRIVATE_CHAT', count: 1 }] }],
  enterpriseControlCenter: { generatedAt: '2026-10-08T00:00:00.000Z', readinessScore: 90, posture: 'healthy', metrics: [{ key: 'ai_policy', label: 'AI politika', tone: 'healthy', value: 100, detail: 'Policy active' }], actions: [], security: { activeSessionCount: 1, weakPermissionRiskCount: 0, apiKeyRotationRiskCount: 0, webhookIssueCount: 0, publicEndpointAbuseCount: 0 }, observability: { failedAiRequestCount: 1, fallbackAiRequestCount: 1, deniedPermissionCount: 1, partialPermissionCount: 0, redactedFieldEventCount: 1, recentFailureAt: '2026-10-08T00:00:00.000Z' } },
};
const log = { id: 'log-1', userId: 'u1', requestType: 'PRIVATE_CHAT', promptVersion: 'test:v1', model: 'gpt-4o', entityType: null, entityId: null, entityContext: null, permissionCheckResult: 'ALLOWED', redactedFields: ['email'], inputSummary: 'TEST input', outputSummary: 'TEST output', draft: null, result: { governance: { tokenCostEstimateUsd: 0.005 } }, userApprovedAction: null, status: 'SUCCEEDED', usedTools: false, tokenPrompt: 400, tokenCompletion: 600, tokenTotal: 1000, errorMessage: null, createdAt: '2026-10-08T00:00:00.000Z', completedAt: '2026-10-08T00:00:01.000Z' };

test('governance renders, filters, opens detail and persists controls', async ({ page }) => {
  const puts: Array<{ url: string; body: unknown }> = [];
  await page.route('**/api/intelligence/ai-governance/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (method === 'PUT') {
      puts.push({ url, body: route.request().postDataJSON() });
      const body = url.endsWith('/policy') ? { data: policy } : { data: insights };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (url.includes('/logs')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [log], meta: { total: 1, page: 1, pageSize: 30, totalPages: 1 } }) });
    if (url.endsWith('/policy')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: policy }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: insights }) });
  });
  await login(page);
  await page.goto('/dashboard/settings/ai-governance');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/AI Governance/);
  await expect(page.getByText('TEST input')).toBeVisible();
  await expect(page.getByText('90/100')).toBeVisible();
  await page.getByLabel('AI log detayini ac').click();
  await expect(page.getByText('AI Detayi')).toBeVisible();
  await page.getByRole('button', { name: 'Kapat', exact: true }).click();
  await page.getByText(/Kapatmak i.*t.*kla/).first().click();
  await expect.poll(() => puts.some((item) => item.url.endsWith('/policy'))).toBe(true);
  await page.getByPlaceholder('Aylik USD limit').fill('25');
  await page.getByLabel('Maliyet uyari yuzdesi').fill('75');
  await page.getByPlaceholder('Aylik USD limit').locator('xpath=ancestor::section[1]').getByRole('button', { name: 'Kaydet' }).click();
  await expect.poll(() => puts.some((item) => item.url.endsWith('/insights/settings'))).toBe(true);
  await page.reload();
  await expect(page.getByText('Sensitive Field Registry')).toBeVisible();
});

test('governance shows API failure and retries all core queries', async ({ page }) => {
  let failing = true;
  await page.route('**/api/intelligence/ai-governance/**', (route) => route.fulfill(failing
    ? { status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'controlled governance error' } }) }
    : route.request().url().includes('/logs')
      ? { status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0, page: 1, pageSize: 30, totalPages: 0 } }) }
      : route.request().url().endsWith('/policy')
        ? { status: 200, contentType: 'application/json', body: JSON.stringify({ data: policy }) }
        : { status: 200, contentType: 'application/json', body: JSON.stringify({ data: insights }) }));
  await login(page);
  await page.goto('/dashboard/settings/ai-governance');
  await expect(page.getByText('controlled governance error')).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: /Tekrar dene/ }).click();
  await expect(page.getByText('controlled governance error')).not.toBeVisible();
  await expect(page.getByText('Tenant AI Politikas')).toBeVisible();
});
