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
settingsRoutes.get('/security/corporate', requirePermission('settings', 'READ'), SettingsController.getCorporateSecuritySettings);
settingsRoutes.post('/security/corporate', requirePermission('settings', 'UPDATE'), SettingsController.updateCorporateSecuritySettings);
settingsRoutes.post('/security/scim/generate-token', requirePermission('settings', 'UPDATE'), SettingsController.generateScimToken);
settingsRoutes.get('/security/siem', requirePermission('settings', 'READ'), SettingsController.getSiemSettings);
settingsRoutes.post('/security/siem', requirePermission('settings', 'UPDATE'), SettingsController.updateSiemSettings);
settingsRoutes.post('/security/siem/test-export', requirePermission('settings', 'UPDATE'), SettingsController.runSiemExportTest);
settingsRoutes.get('/security/portal-tokens/:contactId', requirePermission('settings', 'READ'), SettingsController.getPortalToken);
settingsRoutes.post('/security/portal-tokens/:contactId/generate', requirePermission('settings', 'UPDATE'), SettingsController.generatePortalToken);
settingsRoutes.get('/security/bi', requirePermission('settings', 'READ'), SettingsController.getBiSettings);
settingsRoutes.post('/security/bi', requirePermission('settings', 'UPDATE'), SettingsController.updateBiSettings);
settingsRoutes.post('/security/bi/generate-token', requirePermission('settings', 'UPDATE'), SettingsController.generateBiToken);
settingsRoutes.post('/security/bi/run-schedule', requirePermission('settings', 'UPDATE'), SettingsController.runBiScheduleSimulation);
settingsRoutes.get('/setup-checklist', requirePermission('settings', 'READ'), QuickStartController.checklist);
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
