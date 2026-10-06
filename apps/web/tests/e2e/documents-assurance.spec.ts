import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.route('**/api/settings', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'wizard', key: 'wizard_completed', value: 'true' }] }) }));
  await page.goto('/login');
  await page.getByLabel(/E-posta/).fill('admin@axondemo.com');
  await page.getByRole('textbox', { name: /ifre/, exact: true }).fill('demo1234');
  await page.getByRole('button', { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/dashboard/);
}

test('document center filters, CRUD, versions, access log, OCR and retry states work', async ({ page }) => {
  const now = new Date().toISOString();
  let tenantId = '';
  let libraryCalls = 0, uploadCalls = 0, editCalls = 0, versionCalls = 0, deleteCalls = 0, bulkCalls = 0, downloadCalls = 0;
  let failLibrary = false;
  const item = { id: 'attachment-1', documentId: 'CONTACT:c1:GENERAL:test', versionId: 'attachment-1', source: 'ATTACHMENT', category: 'CUSTOMER', fileName: 'TEST_E2E_DOCUMENT_UI.txt', mimeType: 'text/plain', fileSize: 42, createdAt: now, uploadedById: 'u1', uploadedByLabel: 'Test User', entityType: 'CONTACT', entityId: 'c1', entityLabel: 'TEST Cari', href: '/dashboard/contacts/c1', downloadUrl: '/api/attachments/attachment-1/download', tags: ['TEST', 'TXT'], documentKind: 'GENERAL', confidentiality: 'INTERNAL', validFrom: null, validUntil: null, version: 1, versionGroupKey: 'g1', versionCount: 1, latestVersion: 1, isLatestVersion: true, lifecycleStatus: 'NO_EXPIRY', lifecycleAction: null, ocrStatus: 'TEXT_READY', isExpired: false, expiresSoon: false };
  const response = () => ({ data: [item], meta: { total: 1, page: 1, pageSize: 30, totalPages: 1, summary: { totalDocuments: 1, attachmentCount: 1, mailAttachmentCount: 0, totalSizeBytes: 42, expiredCount: 0, expiringSoonCount: 0, contractCount: 0, employeeDocumentCount: 0, confidentialCount: 0, oldVersionCount: 0, ocrReadyCount: 1, ocrProviderRequiredCount: 0, contractRenewalAlertCount: 0, employeeChecklistMissingCount: 0 } } });
  await page.route('**/api/attachments/library**', async (route) => { libraryCalls++; await route.fulfill(failLibrary ? { status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'controlled documents error' } }) } : { status: 200, contentType: 'application/json', body: JSON.stringify(response()) }); });
  await page.route('**/api/attachments/entity-options**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'c1', label: 'TEST Cari', detail: 'test@example.test' }] }) }));
  await page.route('**/api/attachments/upload', async (route) => { uploadCalls++; await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { id: 'new-1', tenantId, entityType: 'CONTACT', entityId: 'c1', fileName: 'upload.txt', storagePath: `${tenantId}/upload.txt`, mimeType: 'text/plain', fileSize: 4, category: null, tags: [], documentKind: null, confidentiality: null, validFrom: null, validUntil: null, version: 1, uploadedById: 'u1', createdAt: now } }) }); });
  await page.route('**/api/attachments/attachment-1/version', async (route) => { versionCalls++; await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { id: 'v2', tenantId, entityType: 'CONTACT', entityId: 'c1', fileName: item.fileName, storagePath: `${tenantId}/v2.txt`, mimeType: 'text/plain', fileSize: 2, category: 'CUSTOMER', tags: [], documentKind: 'GENERAL', confidentiality: 'INTERNAL', validFrom: null, validUntil: null, version: 2, uploadedById: 'u1', createdAt: now } }) }); });
  await page.route('**/api/attachments/attachment-1/signed-url', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { url: '/api/attachments/attachment-1/download', direct: false, expiresAt: now } }) }));
  await page.route('**/api/attachments/attachment-1/download', async (route) => { downloadCalls++; await route.fulfill({ status: 200, contentType: 'text/plain', body: 'downloaded' }); });
  await page.route('**/api/attachments/attachment-1/access-log', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'log1', userId: 'u1', action: 'DOWNLOAD', ipAddress: '127.0.0.1', userAgent: 'pw', createdAt: now }] }) }));
  await page.route('**/api/attachments/attachment-1', async (route) => {
    if (route.request().method() === 'DELETE') { deleteCalls++; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { success: true } }) }); return; }
    editCalls++; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { id: item.id, tenantId, entityType: 'CONTACT', entityId: 'c1', fileName: 'TEST_EDIT.txt', storagePath: `${tenantId}/test.txt`, mimeType: 'text/plain', fileSize: 42, category: 'CUSTOMER', tags: [], documentKind: 'GENERAL', confidentiality: 'INTERNAL', validFrom: null, validUntil: null, version: 1, uploadedById: 'u1', createdAt: now } }) });
  });
  await page.route('**/api/attachments/bulk-metadata', async (route) => { bulkCalls++; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { updatedCount: 1, skippedCount: 0 } }) }); });
  await page.route('**/api/intelligence/ocr/attachments/attachment-1/draft', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { attachment: { id: item.id, fileName: item.fileName, mimeType: 'text/plain' }, status: 'PROVIDER_REQUIRED', providerRequired: true, message: 'TEST OCR provider gerekli' } }) }));
  page.on('dialog', (dialog) => dialog.accept());

  await login(page);
  const meResponse = await page.request.get('http://localhost:3001/api/auth/me');
  const me = await meResponse.json() as { data: { tenant: { id: string } } };
  tenantId = me.data.tenant.id;
  await page.goto('/dashboard/documents');
  await page.addStyleTag({ content: '.fixed.inset-0.z-50.pointer-events-none { display: none !important; }' });
  const onboardingClose = page.getByRole('button', { name: /Onboarding.*kapat/ });
  if (await onboardingClose.isVisible()) await onboardingClose.click();
  await expect(page.getByRole('heading', { level: 1, name: /Dok.*man Merkezi/ })).toBeVisible();
  await expect(page.getByText(item.fileName)).toBeVisible();
  await expect(page.getByText('42 B').first()).toBeVisible();
  await page.getByPlaceholder(/Dosya ad/).fill('TEST');
  await expect.poll(() => libraryCalls).toBeGreaterThan(1);
  await page.locator('main select').nth(0).selectOption('CUSTOMER');
  await page.locator('main select').nth(1).selectOption('ATTACHMENT');

  await page.getByRole('button', { name: /Yeni dosya/ }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').nth(0).selectOption('CONTACT');
  await dialog.getByPlaceholder(/sim, numara|sim, numara/).fill('TEST');
  await dialog.getByRole('combobox').nth(1).selectOption('c1');
  await dialog.locator('input[type=file]').setInputFiles({ name: 'upload.txt', mimeType: 'text/plain', buffer: Buffer.from('test') });
  await dialog.getByRole('button', { name: /^Y.*kle$/ }).click({ force: true });
  await expect.poll(() => uploadCalls).toBe(1);
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: /Dosya bilgilerini/ }).click();
  await page.getByLabel(/Dosya ad/).fill('TEST_EDIT.txt');
  await page.getByRole('button', { name: /Kaydet/ }).click();
  await expect.poll(() => editCalls).toBe(1);
  await page.getByRole('button', { name: /Yeni versiyon/ }).click();
  await page.locator('input[type=file]').last().setInputFiles({ name: 'v2.txt', mimeType: 'text/plain', buffer: Buffer.from('v2') });
  await page.getByRole('button', { name: /Versiyon y/ }).click();
  await expect.poll(() => versionCalls).toBe(1);
  await page.getByRole('button', { name: /Erisim logu/ }).click();
  await expect(page.getByText('DOWNLOAD')).toBeVisible();
  await page.getByRole('button', { name: /Kapat/ }).click();
  await page.getByRole('button', { name: /Belgeden taslak/ }).click();
  await expect(page.getByText('TEST OCR provider gerekli')).toBeVisible();
  await page.getByRole('button', { name: /Kapat/ }).click();
  await page.getByRole('button', { name: /Dosyay.* indir/ }).click();
  await expect.poll(() => downloadCalls).toBe(1);

  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: /Metadata g/ }).click();
  await page.getByLabel(/Kategori/).last().selectOption('OTHER');
  await page.getByRole('button', { name: /dosyay.* g/ }).click();
  await expect.poll(() => bulkCalls).toBe(1);
  await page.getByRole('button', { name: /Dosyay.* sil/ }).click();
  await expect.poll(() => deleteCalls).toBe(1);

  failLibrary = true;
  await page.getByPlaceholder(/Dosya ad/).fill('FAIL');
  await expect(page.getByText(/Sunucu hatas.*500/)).toBeVisible();
  failLibrary = false;
  await page.getByRole('button', { name: /Tekrar dene/ }).click();
  await expect(page.getByText(item.fileName)).toBeVisible();
});
