import { brandingSettingsController } from './settings.controller/branding.js';
import { complianceSettingsController } from './settings.controller/compliance.js';
import { deploymentSettingsController } from './settings.controller/deployment.js';
import { generalSettingsController } from './settings.controller/general.js';
import { securitySettingsController } from './settings.controller/security.js';

export const SettingsController = {
  ...generalSettingsController,
  ...brandingSettingsController,
  ...securitySettingsController,
  ...complianceSettingsController,
  ...deploymentSettingsController,
} as const;
