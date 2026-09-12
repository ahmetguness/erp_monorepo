import { Hono } from 'hono';
import { requireAdmin, requireAdminPermission, requireRecentAdminMfa } from '../middleware/requireAdmin';
import { platformAdminAuditMiddleware } from '../middleware/platform-admin-audit.js';
import { adminIdempotency } from '../middleware/admin-idempotency.js';
import { adminApiOpenApi } from '../modules/platform/admin-api-safety/index.js';
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
AdminTenantProvisioningController,
AdminSubscriptionOperationsController,
AdminFeatureRolloutController,
AdminOperationInterventionController,
AdminPersistentObservabilityController,
AdminIncidentController,
AdminTenant360Controller,
AdminSupportSessionController,
AdminSupportTicketController,
AdminDisasterRecoveryController,
AdminPrivacyController,
AdminGlobalSearchController,
AdminInboxController,
AdminDecisionDashboardController,
AdminUiPreferencesController,
AdminListOperationsController,
AdminSensitiveDataController,
} from '../modules/platform/http/controllers/index.js';

const adminRoutes = new Hono();

// â”€â”€ Public (no auth) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
adminRoutes.post('/auth/login', AdminAuthController.login);
adminRoutes.post('/auth/accept-invitation', AdminUserController.acceptInvitation);
adminRoutes.post('/auth/logout', AdminAuthController.logout);
adminRoutes.post('/auth/refresh', AdminAuthController.refresh);
adminRoutes.post('/auth/reauthenticate', requireAdmin, AdminSessionController.reauthenticate);
adminRoutes.get('/auth/sessions', requireAdmin, AdminSessionController.list);
adminRoutes.get('/auth/security-events', requireAdmin, AdminSessionController.events);
adminRoutes.delete('/auth/sessions/:id', requireAdmin, requireRecentAdminMfa, adminIdempotency, AdminSessionController.revoke);
adminRoutes.post('/auth/revoke-all', requireAdmin, requireRecentAdminMfa, adminIdempotency, AdminSessionController.revokeAll);

adminRoutes.use('*', async (c, next) => {
  const isChangePreview = c.req.method === 'POST' && c.req.path === '/api/admin/change-requests/preview';
  // Ending an owned support session only removes access; do not block emergency exit on step-up MFA.
  const isSupportExit = c.req.method === 'POST' && /^\/api\/admin\/tenants\/[^/]+\/support-sessions\/[^/]+\/revoke$/.test(c.req.path);
  const isUiPreferenceUpdate = c.req.method === 'PUT' && c.req.path === '/api/admin/ui-preferences';
  const isListPreferenceUpdate = ['POST', 'DELETE'].includes(c.req.method) && /^\/api\/admin\/tenant-list-views(?:\/[^/]+)?$/.test(c.req.path);
  const isBulkPreview = c.req.method === 'POST' && c.req.path === '/api/admin/tenants/bulk-note/preview';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    return requireAdmin(c, async () => {
      if (isChangePreview || isSupportExit || isUiPreferenceUpdate || isListPreferenceUpdate || isBulkPreview) await next();
      else {
        const response = await requireRecentAdminMfa(c, next);
        if (response) c.res = response;
      }
    });
  }
  await next();
});
adminRoutes.use('*', adminIdempotency);
adminRoutes.use('*', platformAdminAuditMiddleware);

// â”€â”€ Protected routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Auth
adminRoutes.get('/contracts/openapi.json', requireAdmin, (c) => c.json(adminApiOpenApi));
adminRoutes.post('/sensitive-data/access-grants', requireAdmin, requireAdminPermission('sensitive-data.reveal'), AdminSensitiveDataController.create);
adminRoutes.get('/global-search', requireAdmin, requireAdminPermission('search.read'), AdminGlobalSearchController.search);
adminRoutes.get('/inbox', requireAdmin, requireAdminPermission('inbox.read'), AdminInboxController.list);
adminRoutes.post('/inbox/actions', requireAdmin, requireAdminPermission('inbox.read'), AdminInboxController.action);
adminRoutes.put('/inbox/preferences', requireAdmin, requireAdminPermission('inbox.read'), AdminInboxController.preferences);
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
adminRoutes.get('/revenue', requireAdmin, requireAdminPermission('tenant.read'), AdminSubscriptionOperationsController.overview);
adminRoutes.post('/billing/provider-events', requireAdmin, requireAdminPermission('tenant.plan.update'), AdminSubscriptionOperationsController.event);
adminRoutes.get('/billing/coupons', requireAdmin, requireAdminPermission('tenant.read'), AdminSubscriptionOperationsController.listCoupons);
adminRoutes.post('/billing/coupons', requireAdmin, requireAdminPermission('tenant.plan.update'), AdminSubscriptionOperationsController.coupon);
adminRoutes.delete('/billing/coupons/:id', requireAdmin, requireAdminPermission('tenant.plan.update'), AdminSubscriptionOperationsController.deactivateCoupon);
adminRoutes.get('/tenants/:id/subscription', requireAdmin, requireAdminPermission('tenant.read'), AdminSubscriptionOperationsController.get);
adminRoutes.post('/tenants/:id/subscription/quote', requireAdmin, requireAdminPermission('tenant.plan.update'), AdminSubscriptionOperationsController.quote);
adminRoutes.post('/tenants/:id/subscription/coupon', requireAdmin, requireAdminPermission('tenant.plan.update'), AdminSubscriptionOperationsController.applyCoupon);
adminRoutes.post('/tenants/:id/subscription/reconcile', requireAdmin, requireAdminPermission('tenant.settings.update'), AdminSubscriptionOperationsController.reconcile);
adminRoutes.post('/tenants/:id/subscription/custom-prices', requireAdmin, requireAdminPermission('tenant.plan.update'), AdminSubscriptionOperationsController.requestPrice);
adminRoutes.post('/tenants/:id/subscription/custom-prices/:requestId/decision', requireAdmin, requireAdminPermission('tenant.plan.approve'), AdminSubscriptionOperationsController.decidePrice);
adminRoutes.post('/tenants/preview', requireAdmin, requireAdminPermission('tenant.create'), AdminTenantProvisioningController.preview);
adminRoutes.get('/tenant-provisioning', requireAdmin, requireAdminPermission('tenant.create'), AdminTenantProvisioningController.list);
adminRoutes.get('/tenant-provisioning/:jobId', requireAdmin, requireAdminPermission('tenant.create'), AdminTenantProvisioningController.get);
adminRoutes.post('/tenant-provisioning/:jobId/retry', requireAdmin, requireAdminPermission('tenant.create'), AdminTenantProvisioningController.retry);
adminRoutes.get('/tenants/:id/lifecycle', requireAdmin, requireAdminPermission('tenant.read'), AdminTenantLifecycleController.get);
adminRoutes.post('/tenants/:id/lifecycle/requests', requireAdmin, requireAdminPermission('tenant.status.update'), AdminTenantLifecycleController.request);
adminRoutes.post('/tenants/:id/lifecycle/requests/:requestId/decision', requireAdmin, requireAdminPermission('tenant.status.approve'), AdminTenantLifecycleController.decide);
adminRoutes.post('/tenants/:id/lifecycle/export', requireAdmin, requireAdminPermission('tenant.export'), AdminTenantLifecycleController.export);
adminRoutes.get('/tenants/:id/support-targets', requireAdmin, requireAdminPermission('support-session.manage'), AdminSupportSessionController.targets);
adminRoutes.get('/tenants/:id/support-sessions', requireAdmin, requireAdminPermission('support-session.manage'), AdminSupportSessionController.list);
adminRoutes.post('/support-sessions', requireAdmin, requireAdminPermission('support-session.manage'), AdminSupportSessionController.request);
adminRoutes.post('/tenants/:id/support-sessions/:sessionId/revoke', requireAdmin, requireAdminPermission('support-session.manage'), AdminSupportSessionController.revoke);
adminRoutes.get('/support-tickets', requireAdmin, requireAdminPermission('support-ticket.read'), AdminSupportTicketController.list);
adminRoutes.get('/support-tickets/:id', requireAdmin, requireAdminPermission('support-ticket.read'), AdminSupportTicketController.get);
adminRoutes.post('/support-tickets/:id/messages', requireAdmin, requireAdminPermission('support-ticket.manage'), AdminSupportTicketController.addMessage);
adminRoutes.patch('/support-tickets/:id', requireAdmin, requireAdminPermission('support-ticket.manage'), AdminSupportTicketController.update);
adminRoutes.get('/tenants', requireAdmin, requireAdminPermission('tenant.read'), AdminTenantController.list);
adminRoutes.get('/tenant-list-views', requireAdmin, requireAdminPermission('tenant.read'), AdminListOperationsController.views);
adminRoutes.get('/tenants/export', requireAdmin, requireAdminPermission('tenant.export'), AdminListOperationsController.export);
adminRoutes.post('/tenant-list-views', requireAdmin, requireAdminPermission('tenant.read'), AdminListOperationsController.saveView);
adminRoutes.delete('/tenant-list-views/:id', requireAdmin, requireAdminPermission('tenant.read'), AdminListOperationsController.deleteView);
adminRoutes.post('/tenants/bulk-note/preview', requireAdmin, requireAdminPermission('tenant.settings.update'), AdminListOperationsController.preview);
adminRoutes.post('/tenants/bulk-note', requireAdmin, requireAdminPermission('tenant.settings.update'), AdminListOperationsController.execute);
adminRoutes.post('/tenants', requireAdmin, requireAdminPermission('tenant.create'), AdminTenantProvisioningController.create);
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
adminRoutes.get('/feature-rollouts', requireAdmin, requireAdminPermission('feature.read'), AdminFeatureRolloutController.list);
adminRoutes.post('/feature-rollouts', requireAdmin, requireAdminPermission('feature.update'), AdminFeatureRolloutController.create);
adminRoutes.post('/feature-rollouts/:id/activate', requireAdmin, requireAdminPermission('feature.update'), AdminFeatureRolloutController.activate);
adminRoutes.post('/feature-rollouts/:id/stop', requireAdmin, requireAdminPermission('feature.update'), AdminFeatureRolloutController.stop);
adminRoutes.post('/feature-rollouts/:id/metrics', requireAdmin, requireAdminPermission('feature.update'), AdminFeatureRolloutController.metric);

// Metrics
adminRoutes.get('/metrics', requireAdmin, requireAdminPermission('dashboard.read'), AdminMetricsController.dashboard);
adminRoutes.get('/decision-dashboard', requireAdmin, requireAdminPermission('dashboard.read'), AdminDecisionDashboardController.get);
adminRoutes.get('/ui-preferences', requireAdmin, requireAdminPermission('dashboard.read'), AdminUiPreferencesController.get);
adminRoutes.put('/ui-preferences', requireAdmin, requireAdminPermission('dashboard.read'), AdminUiPreferencesController.update);
adminRoutes.get('/metrics/tenants/:id', requireAdmin, requireAdminPermission('tenant.read'), AdminMetricsController.tenantMetrics);
adminRoutes.get('/observability/search', requireAdmin, requireAdminPermission('operations.read'), AdminMetricsController.observabilitySearch);
adminRoutes.get('/observability', requireAdmin, requireAdminPermission('operations.read'), AdminMetricsController.observability);
adminRoutes.get('/operation-items/:id', requireAdmin, requireAdminPermission('operations.read'), AdminOperationInterventionController.detail);
adminRoutes.post('/operation-interventions', requireAdmin, requireAdminPermission('operations.manage'), AdminOperationInterventionController.intervene);
adminRoutes.get('/observability/history', requireAdmin, requireAdminPermission('operations.read'), AdminPersistentObservabilityController.dashboard);
adminRoutes.put('/observability/slos', requireAdmin, requireAdminPermission('operations.manage'), AdminPersistentObservabilityController.slo);
adminRoutes.put('/observability/alerts/:id/ownership', requireAdmin, requireAdminPermission('operations.manage'), AdminPersistentObservabilityController.ownership);
adminRoutes.post('/observability/alerts/:id/silence', requireAdmin, requireAdminPermission('operations.manage'), AdminPersistentObservabilityController.silence);
adminRoutes.post('/observability/deployments', requireAdmin, requireAdminPermission('operations.manage'), AdminPersistentObservabilityController.deployment);
adminRoutes.get('/incidents', requireAdmin, requireAdminPermission('operations.read'), AdminIncidentController.list);
adminRoutes.post('/incidents', requireAdmin, requireAdminPermission('operations.manage'), AdminIncidentController.create);
adminRoutes.patch('/incidents/:id', requireAdmin, requireAdminPermission('operations.manage'), AdminIncidentController.update);
adminRoutes.post('/incidents/:id/timeline', requireAdmin, requireAdminPermission('operations.manage'), AdminIncidentController.timeline);
adminRoutes.post('/incidents/:id/communications', requireAdmin, requireAdminPermission('operations.manage'), AdminIncidentController.communication);
adminRoutes.post('/incident-communications/:communicationId/decision', requireAdmin, requireAdminPermission('operations.manage'), AdminIncidentController.decision);

// Audit
adminRoutes.get('/audit-logs', requireAdmin, requireAdminPermission('audit.read'), AdminAuditController.list);
adminRoutes.get('/audit-logs/export', requireAdmin, requireAdminPermission('audit.read'), AdminAuditController.export);
adminRoutes.get('/audit-logs/integrity', requireAdmin, requireAdminPermission('audit.read'), AdminAuditController.integrity);
adminRoutes.put('/audit-logs/retention', requireAdmin, requireAdminPermission('audit.manage'), AdminAuditController.retention);
adminRoutes.get('/audit-logs/:id', requireAdmin, requireAdminPermission('audit.read'), AdminAuditController.detail);

// Security checklist
adminRoutes.get('/security/runtime-health', requireAdmin, requireAdminPermission('security.read'), AdminSecurityController.runtimeHealth);
adminRoutes.get('/security/checklist', requireAdmin, requireAdminPermission('security.read'), AdminSecurityController.checklist);
adminRoutes.get('/security/findings', requireAdmin, requireAdminPermission('security.read'), AdminSecurityController.findings);
adminRoutes.post('/security/scan', requireAdmin, requireAdminPermission('security.manage'), AdminSecurityController.scan);
adminRoutes.patch('/security/findings/:id', requireAdmin, requireAdminPermission('security.manage'), AdminSecurityController.updateFinding);
adminRoutes.post('/security/findings/:id/ticket', requireAdmin, requireAdminPermission('security.manage'), AdminSecurityController.createTicket);
adminRoutes.get('/disaster-recovery', requireAdmin, requireAdminPermission('operations.read'), AdminDisasterRecoveryController.overview);
adminRoutes.post('/disaster-recovery/backups', requireAdmin, requireAdminPermission('operations.manage'), AdminDisasterRecoveryController.recordBackup);
adminRoutes.post('/disaster-recovery/restore-drills', requireAdmin, requireAdminPermission('operations.manage'), AdminDisasterRecoveryController.createDrill);
adminRoutes.patch('/disaster-recovery/restore-drills/:id', requireAdmin, requireAdminPermission('operations.manage'), AdminDisasterRecoveryController.completeDrill);
adminRoutes.put('/disaster-recovery/policy', requireAdmin, requireAdminPermission('operations.manage'), AdminDisasterRecoveryController.updatePolicy);
adminRoutes.get('/privacy/requests', requireAdmin, requireAdminPermission('privacy.read'), AdminPrivacyController.list);
adminRoutes.post('/privacy/requests', requireAdmin, requireAdminPermission('privacy.manage'), AdminPrivacyController.create);
adminRoutes.post('/privacy/requests/:id/verify', requireAdmin, requireAdminPermission('privacy.manage'), AdminPrivacyController.verify);
adminRoutes.post('/privacy/requests/:id/decision', requireAdmin, requireAdminPermission('privacy.manage'), AdminPrivacyController.decide);
adminRoutes.post('/privacy/requests/:id/execute', requireAdmin, requireAdminPermission('privacy.manage'), AdminPrivacyController.execute);
adminRoutes.post('/privacy/requests/:id/download-grant', requireAdmin, requireAdminPermission('privacy.manage'), AdminPrivacyController.grant);
adminRoutes.get('/privacy/download/:token', requireAdmin, requireAdminPermission('privacy.read'), AdminPrivacyController.download);
adminRoutes.post('/privacy/legal-holds', requireAdmin, requireAdminPermission('privacy.manage'), AdminPrivacyController.hold);

export { adminRoutes };
