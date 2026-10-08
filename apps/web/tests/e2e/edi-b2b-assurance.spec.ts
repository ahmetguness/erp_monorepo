import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/E-posta/).fill('admin@axondemo.com');
  await page.getByRole('textbox', { name: /ifre/, exact: true }).fill('demo1234');
  await page.getByRole('button', { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/dashboard/);
  const onboardingClose = page.getByRole('button', { name: /Onboarding.*kapat/ });
  await onboardingClose.waitFor({ state: 'visible', timeout: 1200 }).then(() => onboardingClose.click()).catch(() => undefined);
}

const now = '2026-10-07T12:00:00.000Z';
const hub = {
  generatedAt: now,
  summary: { partnerCount: 1, readyDocumentCount: 2, blockedDocumentCount: 1, inboundOrderCount: 0, outboundDeliveryCount: 1, outboundInvoiceCount: 1, issueCount: 4 },
  partners: [{ contactId: 'c1', code: null, name: 'TEST_E2E B2B Cari', type: 'CUSTOMER', directions: ['inbound'], status: 'needs_mapping', documentCount: 1, totalValue: 1250, lastActivityAt: now, issues: ['partner_code_missing'] }],
  partnerMappings: [{ contactId: 'c1', partnerName: 'TEST_E2E B2B Cari', partnerCode: null, mappingStatus: 'partial', mappedFieldCount: 2, requiredFieldCount: 3, missingFields: ['partner_code_missing'], supportedDocumentTypes: ['sales_order', 'invoice'], lastValidatedAt: now }],
  documentFlows: [
    { key: 'sales_order', title: 'Musteri siparisi', direction: 'inbound', scope: 'orders:write', endpoint: '/api/external/sales-orders', format: 'JSON', status: 'configured', readyCount: 0, blockedCount: 1, note: 'Test akisi' },
    { key: 'purchase_order', title: 'Tedarikci siparisi', direction: 'outbound', scope: 'purchasing:read', endpoint: 'mapping_required:purchase-orders', format: 'JSON', status: 'needs_mapping', readyCount: 0, blockedCount: 0, note: 'Mapping gerekli' },
    { key: 'delivery_note', title: 'Irsaliye alisverisi', direction: 'outbound', scope: 'delivery-notes:read', endpoint: 'mapping_required:delivery-notes', format: 'CSV', status: 'needs_mapping', readyCount: 1, blockedCount: 0, note: 'Test' },
    { key: 'invoice', title: 'Fatura alisverisi', direction: 'outbound', scope: 'invoices:write', endpoint: '/api/external/invoices', format: 'JSON', status: 'configured', readyCount: 1, blockedCount: 0, note: 'Test' },
  ],
  exchangeQueue: [{ id: 'so1', itemKey: 'sales_order:so1', number: 'TEST_E2E_SO', documentType: 'sales_order', direction: 'inbound', partnerName: 'TEST_E2E B2B Cari', partnerCode: null, status: 'draft', amount: 1250, documentDate: now, href: '/dashboard/sales-orders/so1', issueKeys: ['partner_code_missing', 'document_draft'], retryEligible: true, retryAction: 'complete_partner_mapping', slaStatus: 'breached', slaDueAt: now, slaRemainingMinutes: -60 }],
  errorQueue: [{ itemKey: 'sales_order:so1', documentNumber: 'TEST_E2E_SO', documentType: 'sales_order', partnerName: 'TEST_E2E B2B Cari', status: 'draft', severity: 'high', issues: ['partner_code_missing', 'document_draft', 'sla_breached'], retryEligible: true, retryAction: 'complete_partner_mapping', href: '/dashboard/sales-orders/so1' }],
  sla: { trackedCount: 1, breachedCount: 1, warningCount: 0, okCount: 0, averageAgeHours: 25 },
  endpointExamples: [{ method: 'GET', path: '/api/external/sales-orders?page=1&limit=20', scope: 'orders:read', description: 'Test endpoint' }],
};

test('B2B hub renders all sections, retries an error and supports navigation', async ({ page }) => {
  let retryCalls = 0;
  await page.route('**/api/data-exchange/b2b', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: hub }) }));
  await page.route('**/api/data-exchange/b2b/retry', (route) => { retryCalls += 1; return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { taskId: 'task1', itemKey: 'sales_order:so1', assignedToId: 'u1' } }) }); });
  await login(page);
  await page.goto('/dashboard/data-exchange/b2b');
  await page.addStyleTag({ content: '.fixed.inset-0.z-50 { display:none!important; }' });
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/EDI.*B2B/);
  await expect(page.getByText('TEST_E2E B2B Cari').first()).toBeVisible();
  await expect(page.getByText('TEST_E2E_SO').first()).toBeVisible();
  await expect(page.getByText(/1.250/).first()).toBeVisible();
  await expect(page.getByText('orders:write')).toBeVisible();
  await expect(page.getByText('/api/external/sales-orders?page=1&limit=20')).toBeVisible();
  await page.getByRole('button', { name: /Mapping tamamla/ }).click();
  await expect.poll(() => retryCalls).toBe(1);
  const apiKeys = page.getByRole('link', { name: /API anahtar/ });
  await expect(apiKeys).toHaveAttribute('href', '/dashboard/api-keys');
  await page.goBack();
  await page.goForward();
  await expect(page).toHaveURL(/data-exchange\/b2b/);
});

test('B2B hub error state can be retried and recovered', async ({ page }) => {
  let failing = true;
  let calls = 0;
  await page.route('**/api/data-exchange/b2b', (route) => {
    calls += 1;
    return route.fulfill(failing
      ? { status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'controlled b2b error' } }) }
      : { status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...hub, partners: [], partnerMappings: [], exchangeQueue: [], errorQueue: [] } }) });
  });
  await login(page);
  await page.goto('/dashboard/data-exchange/b2b');
  await page.addStyleTag({ content: '.fixed.inset-0.z-50 { display:none!important; }' });
  await expect(page.getByText(/B2B.*al.namad/)).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: 'Tekrar dene' }).click();
  await expect.poll(() => calls).toBeGreaterThan(1);
  await expect(page.getByText(/B2B partner verisi yok/)).toBeVisible();
  await expect(page.getByText(/Hata kuyrugunda kay.t yok/)).toBeVisible();
});
