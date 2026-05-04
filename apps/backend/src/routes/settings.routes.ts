import { Hono } from 'hono';
import { SettingsController } from '../controllers/settings.controller';

// Settings tüm planlara açık — requireAuth zaten tenantApi seviyesinde uygulanıyor
const settingsRoutes = new Hono();

// Tenant settings
settingsRoutes.get('/', SettingsController.listTenantSettings);
settingsRoutes.put('/', SettingsController.upsertTenantSetting);
settingsRoutes.delete('/:key', SettingsController.deleteTenantSetting);

// Module settings
settingsRoutes.get('/modules', SettingsController.listModuleSettings);
settingsRoutes.put('/modules', SettingsController.upsertModuleSetting);

export { settingsRoutes };
