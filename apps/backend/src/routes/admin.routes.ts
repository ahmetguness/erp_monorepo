import { Hono } from 'hono';
import { requireAdmin, requireAdminPermission, requireRecentAdminMfa } from '../middleware/requireAdmin';
import {
AdminAuditController,
AdminChangeRequestController,
AdminAuthController,
AdminUserController,
AdminSessionController,
AdminFeatureController,
AdminMetricsController,
AdminSecurityController,
AdminTenantController,
AdminTenantLifecycleController,
AdminTenant360Controller,
AdminSupportSessionController,
} from '../modules/platform/http/controllers/index.js';

const adminRoutes = new Hono();

// ── Public (no auth) ─────────────────────────
adminRoutes.post('/auth/login', AdminAuthController.login);
adminRoutes.post('/auth/accept-invitation', AdminUserController.acceptInvitation);
adminRoutes.post('/auth/logout', AdminAuthController.logout);
adminRoutes.post('/auth/refresh', AdminAuthController.refresh);
adminRoutes.post('/auth/reauthenticate', requireAdmin, AdminSessionController.reauthenticate);
adminRoutes.get('/auth/sessions', requireAdmin, AdminSessionController.list);
adminRoutes.get('/auth/security-events', requireAdmin, AdminSessionController.events);
adminRoutes.delete('/auth/sessions/:id', requireAdmin, requireRecentAdminMfa, AdminSessionController.revoke);
adminRoutes.post('/auth/revoke-all', requireAdmin, requireRecentAdminMfa, AdminSessionController.revokeAll);

adminRoutes.use('*', async (c, next) => {
  const isChangePreview = c.req.method === 'POST' && c.req.path === '/api/admin/change-requests/preview';
  // Ending an owned support session only removes access; do not block emergency exit on step-up MFA.
  const isSupportExit = c.req.method === 'POST' && /^\/api\/admin\/tenants\/[^/]+\/support-sessions\/[^/]+\/revoke$/.test(c.req.path);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && !isChangePreview && !isSupportExit) {
    return requireAdmin(c, async () => {
      const response = await requireRecentAdminMfa(c, next);
      if (response) c.res = response;
    });
  }
  await next();
});

// ── Protected routes ─────────────────────────
// Auth
adminRoutes.get('/auth/me', requireAdmin, AdminAuthController.me);
adminRoutes.get('/admin-users', requireAdmin, requireAdminPermission('admin-user.read'), AdminUserController.list);
adminRoutes.post('/admin-users/invite', requireAdmin, requireAdminPermission('admin-user.manage'), AdminUserController.invite);
adminRoutes.patch('/admin-users/:id', requireAdmin, requireAdminPermission('admin-user.manage'), AdminUserController.update);
adminRoutes.post('/admin-users/:id/revoke-sessions', requireAdmin, requireAdminPermission('admin-user.manage'), AdminUserController.revokeSessions);

// Two-person approval
adminRoutes.post('/change-requests/preview', requireAdmin, requireAdminPermission('change-request.read'), AdminChangeRequestController.preview);
adminRoutes.get('/change-requests', requireAdmin, requireAdminPermission('change-request.read'), AdminChangeRequestController.list);
adminRoutes.post('/change-requests/:id/approve', requireAdmin, requireAdminPermission('change-request.read'), AdminChangeRequestController.approve);
adminRoutes.post('/change-requests/:id/reject', requireAdmin, requireAdminPermission('change-request.read'), AdminChangeRequestController.reject);
adminRoutes.post('/change-requests/:id/rollback', requireAdmin, requireAdminPermission('change-request.read'), AdminChangeRequestController.rollback);

// Tenants
adminRoutes.get('/tenants/:id/lifecycle', requireAdmin, requireAdminPermission('tenant.read'), AdminTenantLifecycleController.get);
adminRoutes.post('/tenants/:id/lifecycle/requests', requireAdmin, requireAdminPermission('tenant.status.update'), AdminTenantLifecycleController.request);
adminRoutes.post('/tenants/:id/lifecycle/requests/:requestId/decision', requireAdmin, requireAdminPermission('tenant.status.approve'), AdminTenantLifecycleController.decide);
adminRoutes.post('/tenants/:id/lifecycle/export', requireAdmin, requireAdminPermission('tenant.export'), AdminTenantLifecycleController.export);
adminRoutes.get('/tenants/:id/support-targets', requireAdmin, requireAdminPermission('support-session.manage'), AdminSupportSessionController.targets);
adminRoutes.get('/tenants/:id/support-sessions', requireAdmin, requireAdminPermission('support-session.manage'), AdminSupportSessionController.list);
adminRoutes.post('/support-sessions', requireAdmin, requireAdminPermission('support-session.manage'), AdminSupportSessionController.request);
adminRoutes.post('/tenants/:id/support-sessions/:sessionId/revoke', requireAdmin, requireAdminPermission('support-session.manage'), AdminSupportSessionController.revoke);
adminRoutes.get('/tenants', requireAdmin, requireAdminPermission('tenant.read'), AdminTenantController.list);
adminRoutes.post('/tenants', requireAdmin, requireAdminPermission('tenant.create'), AdminTenantController.create);
adminRoutes.get('/tenants/:id', requireAdmin, requireAdminPermission('tenant.read'), AdminTenantController.getById);
adminRoutes.get('/tenants/:id/360', requireAdmin, requireAdminPermission('tenant.read'), AdminTenant360Controller.get);
adminRoutes.post('/tenants/:id/support-notes', requireAdmin, requireAdminPermission('tenant.settings.update'), AdminTenant360Controller.addNote);
adminRoutes.patch('/tenants/:id', requireAdmin, requireAdminPermission('tenant.settings.update'), AdminTenantController.updateTenant);
adminRoutes.post('/tenants/:id/plan', requireAdmin, requireAdminPermission('tenant.plan.update'), AdminTenantController.updatePlan);
adminRoutes.post('/tenants/:id/status', requireAdmin, requireAdminPermission('tenant.status.update'), AdminTenantController.updateStatus);

// Features
adminRoutes.get('/features', requireAdmin, requireAdminPermission('feature.read'), AdminFeatureController.listPlanFeatures);
adminRoutes.put('/features', requireAdmin, requireAdminPermission('feature.update'), AdminFeatureController.updatePlanFeature);
adminRoutes.get('/overrides', requireAdmin, requireAdminPermission('feature.read'), AdminFeatureController.listOverrides);
adminRoutes.post('/overrides', requireAdmin, requireAdminPermission('feature.override.create'), AdminFeatureController.createOverride);
adminRoutes.delete('/overrides/:id', requireAdmin, requireAdminPermission('feature.override.delete'), AdminFeatureController.deleteOverride);

// Metrics
adminRoutes.get('/metrics', requireAdmin, requireAdminPermission('dashboard.read'), AdminMetricsController.dashboard);
adminRoutes.get('/metrics/tenants/:id', requireAdmin, requireAdminPermission('tenant.read'), AdminMetricsController.tenantMetrics);
adminRoutes.get('/observability/search', requireAdmin, requireAdminPermission('operations.read'), AdminMetricsController.observabilitySearch);
adminRoutes.get('/observability', requireAdmin, requireAdminPermission('operations.read'), AdminMetricsController.observability);

// Audit
adminRoutes.get('/audit-logs', requireAdmin, requireAdminPermission('audit.read'), AdminAuditController.list);

// Security checklist
adminRoutes.get('/security/runtime-health', requireAdmin, requireAdminPermission('security.read'), AdminSecurityController.runtimeHealth);
adminRoutes.get('/security/checklist', requireAdmin, requireAdminPermission('security.read'), AdminSecurityController.checklist);

export { adminRoutes };
