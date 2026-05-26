import { Hono } from 'hono';
import { SettingsController } from '../controllers/settings.controller';
import { requirePermission } from '../middleware/requirePermission';

// Settings tüm planlara açık — requireAuth zaten tenantApi seviyesinde uygulanıyor
const settingsRoutes = new Hono();

// Tenant settings
settingsRoutes.get('/', requirePermission('settings', 'READ'), SettingsController.listTenantSettings);
settingsRoutes.put('/', requirePermission('settings', 'UPDATE'), SettingsController.upsertTenantSetting);
settingsRoutes.get('/business-rules', requirePermission('settings', 'READ'), SettingsController.listBusinessRules);
settingsRoutes.put('/business-rules', requirePermission('settings', 'UPDATE'), SettingsController.upsertBusinessRule);
settingsRoutes.get('/security-score', requirePermission('settings', 'READ'), SettingsController.securityScore);
settingsRoutes.get('/logo', requirePermission('settings', 'READ'), SettingsController.downloadTenantLogo);
settingsRoutes.post('/logo', requirePermission('settings', 'UPDATE'), SettingsController.uploadTenantLogo);
settingsRoutes.delete('/logo', requirePermission('settings', 'DELETE'), SettingsController.deleteTenantLogo);
settingsRoutes.delete('/:key', requirePermission('settings', 'DELETE'), SettingsController.deleteTenantSetting);

// Module settings
settingsRoutes.get('/modules', requirePermission('settings', 'READ'), SettingsController.listModuleSettings);
settingsRoutes.put('/modules', requirePermission('settings', 'UPDATE'), SettingsController.upsertModuleSetting);

export { settingsRoutes };
