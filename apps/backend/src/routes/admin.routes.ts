import { Hono } from 'hono';
import { requireAdmin, requireAdminPermission } from '../middleware/requireAdmin';
import {
AdminAuditController,
AdminAuthController,
AdminFeatureController,
AdminMetricsController,
AdminSecurityController,
AdminTenantController,
} from '../modules/platform/http/controllers/index.js';

const adminRoutes = new Hono();

// ── Public (no auth) ─────────────────────────
adminRoutes.post('/auth/login', AdminAuthController.login);
adminRoutes.post('/auth/logout', AdminAuthController.logout);

// ── Protected routes ─────────────────────────
// Auth
adminRoutes.get('/auth/me', requireAdmin, AdminAuthController.me);

// Tenants
adminRoutes.get('/tenants', requireAdmin, requireAdminPermission('tenant.read'), AdminTenantController.list);
adminRoutes.post('/tenants', requireAdmin, requireAdminPermission('tenant.create'), AdminTenantController.create);
adminRoutes.get('/tenants/:id', requireAdmin, requireAdminPermission('tenant.read'), AdminTenantController.getById);
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
