import { expect, test, type Page } from '@playwright/test';

interface TestBatch {
  batchId: string;
  entity: string;
  status: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  partialImport: boolean;
  mapping: Record<string, string>;
  rowErrors: unknown[];
  duplicateSuggestions: unknown[];
  createdById: string;
  createdAt: string;
  rolledBackAt: string | null;
  rollbackNote: string;
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/E-posta/).fill('admin@axondemo.com');
  await page.getByRole('textbox', { name: /ifre/, exact: true }).fill('demo1234');
  await page.getByRole('button', { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/dashboard/);
  const onboardingClose = page.getByRole('button', {
    name: /Onboarding.*kapat/,
  });
  await onboardingClose
    .waitFor({ state: 'visible', timeout: 1500 })
    .then(() => onboardingClose.click())
    .catch(() => undefined);
}

test('data exchange preview, export, quality, dedup and rollback flows work', async ({ page }) => {
  const now = new Date().toISOString();
  let templateCalls = 0, exportCalls = 0, previewCalls = 0, rollbackCalls = 0, taskCalls = 0, mergeCalls = 0, mergeRollbackCalls = 0;
  let batches: TestBatch[] = [];
  await page.route('**/api/data-exchange/quality/duplicates/contacts', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'dup1', entity: 'contacts', left: { id: 'c1', label: 'TEST_E2E Cari A', values: { name: 'Cari A', email: 'same@test.local' } }, right: { id: 'c2', label: 'TEST_E2E Cari B', values: { name: 'Cari B', email: 'same@test.local' } }, score: 0.95, risk: 'low', reasons: [{ field: 'email', strength: 'exact', weight: 1, description: 'E-posta aynı' }], mergeSupported: true, mergeBlockedReason: null }] }) }));
  await page.route('**/api/data-exchange/quality/duplicates/products', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
  await page.route('**/api/data-exchange/quality/duplicates/invoices', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
  await page.route('**/api/data-exchange/quality/duplicates/contacts/preview', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { source: { id: 'c1', label: 'Cari A', values: { name: 'Cari A' } }, target: { id: 'c2', label: 'Cari B', values: { name: 'Cari B' } }, fieldWinners: {}, mergedValues: { name: 'Cari B' }, references: { invoices: 1 }, totalReferences: 1, warnings: ['Kaynak pasif olur'], rollbackSupported: true } }) }));
  await page.route('**/api/data-exchange/quality/duplicates/contacts/merge', (route) => { mergeCalls++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { source: { id: 'c1', label: 'Cari A', values: { name: 'Cari A' } }, target: { id: 'c2', label: 'Cari B', values: { name: 'Cari B' } }, fieldWinners: {}, mergedValues: { name: 'Cari B' }, references: { invoices: 1 }, totalReferences: 1, warnings: [], rollbackSupported: true, auditLogId: 'audit1', mergedAt: now } }) }); });
  await page.route('**/api/data-exchange/quality/duplicates/contacts/rollback/audit1', (route) => { mergeRollbackCalls++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { auditLogId: 'audit1', restoredSourceId: 'c1', targetId: 'c2', restoredReferences: 1, rolledBackAt: now } }) }); });
  await page.route('**/api/data-exchange/quality', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { score: 94, issueCount: 2, criticalCount: 0, generatedAt: now, issues: [{ key: 'contacts.duplicate_contact', category: 'contacts', severity: 'high', title: 'Tekrarlı cariler', description: 'Test duplicate', count: 2, scoreImpact: 3, actionLabel: 'Cari listesini aç', href: '/dashboard/contacts', sampleRecords: [{ id: 'c1', label: 'Cari A / Cari B', detail: '2 kayıt' }] }] } }) }));
  await page.route('**/api/data-exchange/quality/contacts.duplicate_contact/task', (route) => { taskCalls++; return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { taskId: 'task1', issueKey: 'contacts.duplicate_contact', assignedToId: null } }) }); });
  await page.route('**/api/data-exchange/import/batches', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: batches }) }));
  await page.route('**/api/data-exchange/import/preview/products', (route) => { previewCalls++; batches = [{ batchId: 'batch1', entity: 'products', status: 'READY', totalRows: 1, validRows: 1, invalidRows: 0, partialImport: false, mapping: {}, rowErrors: [], duplicateSuggestions: [], createdById: 'u1', createdAt: now, rolledBackAt: null, rollbackNote: 'Sadece preview kaydıdır.' }]; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { entity: 'products', headers: ['code', 'name'], rows: [{ rowNumber: 2, values: { code: 'TEST', name: 'Ürün' }, valid: true, errors: [], warnings: [] }], errors: [], validRows: 1, invalidRows: 0, duplicateSuggestions: [], batchPlan: { batchId: 'batch1', mapping: {}, partialImport: false, canImportValidRows: true, rollbackAvailable: true, rollbackNote: 'Sadece preview kaydıdır.' } } }) }); });
  await page.route('**/api/data-exchange/import/batches/batch1/rollback', (route) => { rollbackCalls++; batches[0] = { ...batches[0], status: 'ROLLED_BACK', rolledBackAt: now }; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: batches[0] }) }); });
  await page.route('**/api/data-exchange/templates/products', (route) => { templateCalls++; return route.fulfill({ status: 200, contentType: 'text/csv', body: 'code,name\r\n' }); });
  await page.route('**/api/data-exchange/export/products', (route) => { exportCalls++; return route.fulfill({ status: 200, contentType: 'text/csv', body: 'code,name\r\nTEST,Ürün\r\n' }); });

  await login(page);
  await page.goto('/dashboard/data-exchange');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Aktarma/);
  await expect(page.getByText('Skor: 94')).toBeVisible();
  await page.getByRole('button', { name: /ablon/ }).click();
  await page.getByRole('button', { name: 'Export' }).click();
  await expect.poll(() => templateCalls).toBe(1);
  await expect.poll(() => exportCalls).toBe(1);
  await page.getByPlaceholder(/CSV icerigini/).fill('code,name\nTEST,Ürün');
  await page.getByRole('button', { name: /Kontrol Et/ }).click();
  await expect.poll(() => previewCalls).toBe(1);
  await expect(page.getByText(/Ge.*erli: 1/)).toBeVisible();
  await expect(page.getByText(/batch1/)).toBeVisible();
  await page.getByRole('button', { name: 'Rollback' }).click();
  await expect.poll(() => rollbackCalls).toBe(1);
  await page.getByRole('button', { name: /rev olu.*tur/ }).click();
  await expect.poll(() => taskCalls).toBe(1);
  await page.getByRole('button', { name: /TEST_E2E Cari A/ }).click();
  await page.getByRole('button', { name: /Plan.*nizle/ }).click();
  await expect(page.getByText(/1 ba.*l.* kay.*t/)).toBeVisible();
  await page.getByRole('button', { name: /Onayla ve birle/ }).click();
  await expect.poll(() => mergeCalls).toBe(1);
  await page.getByRole('button', { name: /Birle.*tirmeyi geri al/ }).click();
  await expect.poll(() => mergeRollbackCalls).toBe(1);
});

test('data exchange error states can be retried', async ({ page }) => {
  let qualityCalls = 0, batchCalls = 0, dedupCalls = 0;
  let failing = true;
  const failOrEmpty = (_calls: number, emptyBody: unknown) => failing
    ? { status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'controlled data exchange error' } }) }
    : { status: 200, contentType: 'application/json', body: JSON.stringify(emptyBody) };
  await page.route('**/api/data-exchange/quality/duplicates/contacts', (route) => { dedupCalls++; return route.fulfill(failOrEmpty(dedupCalls, { data: [] })); });
  await page.route('**/api/data-exchange/quality', (route) => { qualityCalls++; return route.fulfill(failOrEmpty(qualityCalls, { data: { score: 100, issueCount: 0, criticalCount: 0, generatedAt: new Date().toISOString(), issues: [] } })); });
  await page.route('**/api/data-exchange/import/batches', (route) => { batchCalls++; return route.fulfill(failOrEmpty(batchCalls, { data: [] })); });
  await login(page);
  await page.goto('/dashboard/data-exchange');
  await expect(page.getByText('controlled data exchange error')).toHaveCount(3);
  failing = false;
  const retries = page.getByRole('button', { name: /Tekrar dene/ });
  for (let remaining = 3; remaining > 0; remaining -= 1) {
    await retries.first().dispatchEvent('click');
    await expect(retries).toHaveCount(remaining - 1);
  }
  await expect(page.getByText(/Veri kalitesi i.*in aktif sorun bulunmad/)).toBeVisible();
  await expect(page.getByText(/Hen.*z batch ge.*mi.*i yok/)).toBeVisible();
  await expect(page.getByText(/m.*kerrer aday bulunmad/)).toBeVisible();
});
