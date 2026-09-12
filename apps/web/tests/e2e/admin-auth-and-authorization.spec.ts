import { expect, test, type Page } from '@playwright/test';

const supportAdmin = {
  id: 'support-admin', email: 'support@example.test', name: 'Support Admin', isActive: true,
  lastLoginAt: null, createdAt: '2026-01-01T00:00:00.000Z', roles: ['SUPPORT'],
  permissions: ['dashboard.read', 'tenant.read', 'support-ticket.read', 'support-session.manage'],
} as const;

async function fillCredentials(page: Page): Promise<void> {
  await page.getByLabel('E-posta adresi').fill('support@example.test');
  await page.getByLabel('Şifre', { exact: true }).fill('correct-horse-battery-staple');
}

test('başarısız admin girişi güvenli ve genel hata gösterir', async ({ page }) => {
  await page.route('**/api/admin/auth/login', (route) => route.fulfill({
    status: 401, contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Geçersiz kimlik bilgileri.' } }),
  }));
  await page.goto('/admin/login');
  await fillCredentials(page);
  await page.getByRole('button', { name: 'Kimlik Doğrula' }).click();
  await expect(page.getByText('Kimlik doğrulama başarısız.')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login$/u);
});

test('MFA challenge QR ve tek kullanımlık kod alanını gösterir', async ({ page }) => {
  await page.route('**/api/admin/auth/login', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: { status: 'MFA_SETUP_REQUIRED', secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/Axon%20ERP%20Admin%3Asupport%40example.test?secret=JBSWY3DPEHPK3PXP&issuer=Axon%20ERP%20Admin' } }),
  }));
  await page.goto('/admin/login');
  await fillCredentials(page);
  await page.getByRole('button', { name: 'Kimlik Doğrula' }).click();
  await expect(page.getByLabel('Altı haneli doğrulama kodu')).toBeVisible();
  await expect(page.locator('svg').filter({ hasText: 'Admin iki faktörlü doğrulama kurulum QR kodu' })).toBeVisible();
  await expect(page.getByText('JBSWY3DPEHPK3PXP')).toBeVisible();
});

test('rol matrisi yetkisiz admin menülerini gizler', async ({ page }) => {
  await page.route('**/api/admin/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: [], meta: { total: 0, page: 1, pageSize: 20, totalPages: 0 } }),
  }));
  await page.route('**/api/admin/auth/login', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: { status: 'AUTHENTICATED', admin: supportAdmin } }),
  }));
  await page.route('**/api/admin/auth/me', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data: supportAdmin }),
  }));
  await page.route('**/api/admin/metrics', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: { tenants: { total: 0, active: 0, trial: 0, suspended: 0 }, plans: { starter: 0, professional: 0, enterprise: 0 }, totals: { users: 0, products: 0, invoices: 0, payments: 0 } } }),
  }));
  await page.route('**/api/admin/ui-preferences', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: { locale: 'tr-TR', highContrast: false, reduceMotion: false, density: 'COMFORTABLE' } }),
  }));
  await page.goto('/admin/login');
  await fillCredentials(page);
  await page.getByRole('button', { name: 'Kimlik Doğrula' }).click();
  await expect(page).toHaveURL(/\/admin$/u);
  await expect(page.locator('a[href="/admin/tenants"]').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Denetim Günlüğü' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Güvenlik Merkezi' })).toHaveCount(0);
});
