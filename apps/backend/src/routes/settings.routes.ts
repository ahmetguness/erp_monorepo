import { Hono } from 'hono';
import { SettingsController } from '../controllers/settings.controller';

const settingsRoutes = new Hono();

// Tenant settings
settingsRoutes.get('/', SettingsController.listTenantSettings);
settingsRoutes.put('/', SettingsController.upsertTenantSetting);
settingsRoutes.delete('/:key', SettingsController.deleteTenantSetting);

// Module settings
settingsRoutes.get('/modules', SettingsController.listModuleSettings);
settingsRoutes.put('/modules', SettingsController.upsertModuleSetting);

export { settingsRoutes };
