import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

async function login(page: Page) {
  await page.route('**/api/settings', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'wizard', key: 'wizard_completed', value: 'true' }] }) }));
  await page.goto('/login');
  await page.getByLabel(/E-posta/).fill('admin@axondemo.com');
  await page.getByRole('textbox', { name: /ifre/, exact: true }).fill('demo1234');
  await page.getByRole('button', { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/dashboard/);
}

const now = new Date().toISOString();
const flow = { id: 'flow-1', tenantId: 'tenant-1', name: 'TEST_E2E_APPROVALS_UI', module: 'OTHER', conditions: { minAmount: null, maxAmount: null, departments: [], documentTypes: [] }, isActive: true, createdAt: now, updatedAt: now, steps: [{ id: 'step-1', flowId: 'flow-1', stepOrder: 1, name: 'Onay', approverRoleId: null, approverUserId: null, isRequired: true }], _count: { requests: 1 } };
const request = { id: 'request-1', tenantId: 'tenant-1', flowId: 'flow-1', entityType: 'OTHER', entityId: 'TEST_E2E_APPROVALS_ENTITY', context: { amount: 100, department: 'Finans', documentType: 'OTHER' }, status: 'PENDING', currentStep: 1, requestedBy: 'user-1', notes: null, createdAt: now, updatedAt: now, resolvedAt: null, flow: { id: 'flow-1', name: flow.name, module: 'OTHER' }, actions: [] };

test('approval flows, requests, actions, navigation and API error recovery work', async ({ page }) => {
  const prisma = new PrismaClient();
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: 'axon-demo' }, select: { id: true } });
  await prisma.$disconnect();
  const tenantFlow = { ...flow, tenantId: tenant.id };
  const tenantRequest = { ...request, tenantId: tenant.id };
  const consoleErrors: string[] = [];
  let actionCalls = 0;
  let failFlows = false;
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.route('**/api/approvals/flows?**', (route) => route.fulfill(failFlows ? { status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'controlled' } }) } : { status: 200, contentType: 'application/json', body: JSON.stringify({ data: [tenantFlow], meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 } }) }));
  await page.route('**/api/approvals/flows/flow-1', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: tenantFlow }) }));
  await page.route('**/api/approvals/requests?**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [tenantRequest], meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 } }) }));
  await page.route('**/api/approvals/requests/request-1/action', async (route) => { actionCalls++; await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { action: { id: 'action-1' }, request: { ...request, status: 'APPROVED' } } }) }); });
  await login(page);
  await page.goto('/dashboard/approvals');
  await expect(page.getByRole('heading', { level: 1, name: /Onay/ })).toBeVisible();
  await expect(page.getByText(flow.name).first()).toBeVisible();
  await page.getByRole('button', { name: /Detay/ }).click();
  await expect(page.getByText('Onay', { exact: true }).last()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Talepler/ }).click();
  await expect(page.locator('code').filter({ hasText: 'TEST_E2E' })).toBeVisible();
  await page.getByRole('button', { name: /Onayla/ }).click();
  await expect.poll(() => actionCalls).toBe(1);
  await page.reload();
  await expect(page.getByText(flow.name).first()).toBeVisible();
  await page.goBack();
  await page.goForward();
  await expect(page).toHaveURL(/dashboard\/approvals/);

  failFlows = true;
  await page.reload();
  await expect(page.getByText(/Sunucu hatası: 500/)).toBeVisible();
  failFlows = false;
  await page.getByRole('button', { name: /Tekrar dene|Yeniden Dene/ }).click();
  await expect(page.getByText(flow.name).first()).toBeVisible();
  expect(consoleErrors.filter((item) => !item.includes('500'))).toEqual([]);
});
