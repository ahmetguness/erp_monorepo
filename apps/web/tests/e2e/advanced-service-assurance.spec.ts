import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) { await page.goto('/login'); await page.getByLabel(/E-posta/).fill('admin@axondemo.com'); await page.getByRole('textbox', { name: /ifre/, exact: true }).fill('demo1234'); await page.getByRole('button', { name: /Giri.*Yap/ }).click(); await expect(page).toHaveURL(/\/dashboard$/); }

const payload = { data: { generatedAt: '2026-10-01T10:00:00.000Z', summary: { horizonDays: 30, activeRequestCount: 3, slaBreachedCount: 1, slaWarningCount: 1, autoAssignmentSuggestionCount: 1, routeReadyCount: 1, sparePartRiskCount: 1, portalTrackedContactCount: 1, customerWaitingCount: 1 }, slaContracts: [{ key: 'CRITICAL', label: 'Kritik SLA', limitHours: 2, activeRequestCount: 1, breachedCount: 1, avgRemainingMinutes: -60 }], technicianRoutes: [{ assignedToId: 'tech-1', technicianLabel: 'Teknisyen A', stopCount: 1, cityCount: 1, highPriorityCount: 1, routeScore: 94, nextStops: [{ serviceRequestId: 'sr-1', serviceRequestNumber: 'TEST_E2E_SR_1', subject: 'Kritik servis', city: 'Istanbul', address: 'Adres', priority: 'CRITICAL', sequence: 1 }] }], autoAssignments: [{ serviceRequestId: 'sr-2', serviceRequestNumber: 'TEST_E2E_SR_2', subject: 'Atama bekliyor', priority: 'HIGH', city: 'Istanbul', suggestedAssigneeId: 'tech-1', suggestedAssigneeLabel: 'Teknisyen A', reason: 'Rota ve yuk', slaRemainingMinutes: 90, score: 82 }], sparePartReservations: [{ serviceRequestId: 'sr-2', serviceRequestNumber: 'TEST_E2E_SR_2', productId: 'p-1', productCode: 'TEST_PART', productName: 'Test Parca', description: 'Parca', requiredQty: 12, availableQty: 10, reservedQty: 0, shortageQty: 2, status: 'shortage' }], portalTracking: [{ contactId: 'c-1', contactName: 'TEST Musteri', portalEnabled: true, openRequestCount: 2, waitingCustomerCount: 1, lastCustomerActivityAt: '2026-10-01T09:00:00.000Z', latestRequestHref: '/dashboard/service/requests/sr-2' }] } };

test('advanced service renders every decision panel, navigates and refetches horizon', async ({ page }) => {
  const urls: string[] = [];
  await page.route('**/api/service/advanced**', async (route) => { urls.push(route.request().url()); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) }); });
  await login(page); await page.goto('/dashboard/service/advanced');
  await expect(page.getByRole('heading', { name: /Servis ileri seviye/ })).toBeVisible();
  await expect(page.getByText('Kritik servis')).toBeVisible(); await expect(page.getByText('Atama bekliyor')).toBeVisible(); await expect(page.getByText('Test Parca')).toBeVisible(); await expect(page.getByText('TEST Musteri')).toBeVisible();
  await expect(page.getByRole('link', { name: /Kritik servis/ })).toHaveAttribute('href', '/dashboard/service/requests/sr-1'); await expect(page.getByRole('link', { name: 'Son talep' })).toHaveAttribute('href', '/dashboard/service/requests/sr-2');
  await page.getByRole('combobox').selectOption('60'); await expect.poll(() => urls.some((url) => url.includes('horizonDays=60'))).toBe(true);
  const before = urls.length; await page.getByRole('button', { name: /Yenile/ }).click(); await expect.poll(() => urls.length).toBeGreaterThan(before);
});

test('advanced service exposes a recoverable API error', async ({ page }) => {
  await page.route('**/api/service/advanced**', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'controlled' } }) }));
  await login(page); await page.goto('/dashboard/service/advanced'); await expect(page.getByRole('heading', { name: /lem tamamlanamad/ })).toBeVisible(); await expect(page.getByRole('button', { name: /Tekrar dene/ })).toBeVisible();
});
