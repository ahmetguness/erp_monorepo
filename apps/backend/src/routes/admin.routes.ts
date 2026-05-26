import { Hono } from 'hono';
import { requireAdmin } from '../middleware/requireAdmin';
import {
  AdminAuthController,
  AdminTenantController,
  AdminFeatureController,
  AdminMetricsController,
  AdminAuditController,
} from '../controllers/admin.controller';
import { AdminSecurityController } from '../controllers/admin-security.controller';

const adminRoutes = new Hono();

// ── Public (no auth) ─────────────────────────
adminRoutes.post('/auth/login', AdminAuthController.login);
adminRoutes.post('/auth/logout', AdminAuthController.logout);

// ── Protected routes ─────────────────────────
// Auth
adminRoutes.get('/auth/me', requireAdmin, AdminAuthController.me);

// Tenants
adminRoutes.get('/tenants', requireAdmin, AdminTenantController.list);
adminRoutes.post('/tenants', requireAdmin, AdminTenantController.create);
adminRoutes.get('/tenants/:id', requireAdmin, AdminTenantController.getById);
adminRoutes.patch('/tenants/:id', requireAdmin, AdminTenantController.updateTenant);
adminRoutes.post('/tenants/:id/plan', requireAdmin, AdminTenantController.updatePlan);
adminRoutes.post('/tenants/:id/status', requireAdmin, AdminTenantController.updateStatus);

// Features
adminRoutes.get('/features', requireAdmin, AdminFeatureController.listPlanFeatures);
adminRoutes.get('/overrides', requireAdmin, AdminFeatureController.listOverrides);
adminRoutes.post('/overrides', requireAdmin, AdminFeatureController.createOverride);
adminRoutes.delete('/overrides/:id', requireAdmin, AdminFeatureController.deleteOverride);

// Metrics
adminRoutes.get('/metrics', requireAdmin, AdminMetricsController.dashboard);
adminRoutes.get('/metrics/tenants/:id', requireAdmin, AdminMetricsController.tenantMetrics);
adminRoutes.get('/observability', requireAdmin, AdminMetricsController.observability);

// Audit
adminRoutes.get('/audit-logs', requireAdmin, AdminAuditController.list);

// Security checklist
adminRoutes.get('/security/checklist', requireAdmin, AdminSecurityController.checklist);

export { adminRoutes };
