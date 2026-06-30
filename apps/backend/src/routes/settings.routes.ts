import { Hono } from 'hono';
import { SettingsController } from '../controllers/settings.controller';
import { QuickStartController } from '../controllers/quick-start.controller';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validateBody';
import {
  businessRuleBodySchema,
  moduleSettingBodySchema,
  tenantSettingBodySchema,
} from '../schemas/request-body.schemas';

// Settings tüm planlara açık — requireAuth zaten tenantApi seviyesinde uygulanıyor
const settingsRoutes = new Hono();

// Tenant settings
settingsRoutes.get('/', requirePermission('settings', 'READ'), SettingsController.listTenantSettings);
settingsRoutes.put('/', requirePermission('settings', 'UPDATE'), validateBody(tenantSettingBodySchema), SettingsController.upsertTenantSetting);
settingsRoutes.get('/business-rules', requirePermission('settings', 'READ'), SettingsController.listBusinessRules);
settingsRoutes.put('/business-rules', requirePermission('settings', 'UPDATE'), validateBody(businessRuleBodySchema), SettingsController.upsertBusinessRule);
settingsRoutes.get('/security-score', requirePermission('settings', 'READ'), SettingsController.securityScore);
settingsRoutes.get('/security/dashboard', requirePermission('settings', 'READ'), SettingsController.securityDashboard);
settingsRoutes.get('/security/sessions', requirePermission('settings', 'READ'), SettingsController.listSecuritySessions);
settingsRoutes.post('/security/sessions/:sessionId/revoke', requirePermission('settings', 'UPDATE'), SettingsController.revokeSecuritySession);
settingsRoutes.get('/logo', requirePermission('settings', 'READ'), SettingsController.downloadTenantLogo);
settingsRoutes.post('/logo', requirePermission('settings', 'UPDATE'), SettingsController.uploadTenantLogo);
settingsRoutes.delete('/logo', requirePermission('settings', 'DELETE'), SettingsController.deleteTenantLogo);
settingsRoutes.delete('/:key', requirePermission('settings', 'DELETE'), SettingsController.deleteTenantSetting);

// Module settings
settingsRoutes.get('/modules', requirePermission('settings', 'READ'), SettingsController.listModuleSettings);
settingsRoutes.put('/modules', requirePermission('settings', 'UPDATE'), validateBody(moduleSettingBodySchema), SettingsController.upsertModuleSetting);

// Quick Start Wizard & Demo cleanup
settingsRoutes.post('/quick-start', requirePermission('settings', 'UPDATE'), QuickStartController.setup);
settingsRoutes.post('/clean-demo-data', requirePermission('settings', 'DELETE'), QuickStartController.cleanDemoData);

export { settingsRoutes };
